const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../services/recommendationService');

test('validates whole-hour meeting request and default limit', () => {
  assert.deepEqual(service.validateMeeting({
    meeting: { duration_minutes: 60, modality: 'onsite', type: 'event' }
  }), {
    meeting: { duration_minutes: 60, modality: 'onsite', type: 'event' },
    limit: 5
  });
});

test('accepts the three explicit training meeting-type labels', () => {
  for (const type of ['project', 'event', 'meeting']) {
    assert.equal(service.validateMeeting({
      meeting: { duration_minutes: 60, modality: 'onsite', type }
    }).meeting.type, type);
  }
});

test('rejects unsupported fields so callers cannot supply schedule context', () => {
  assert.throws(() => service.validateMeeting({
    context: {}, meeting: { duration_minutes: 60, modality: 'onsite', type: 'event' }
  }), { status: 422 });
  assert.throws(() => service.validateMeeting({
    meeting: { duration_minutes: 60, modality: 'onsite', type: 'event', title: 'private' }
  }), { status: 422 });
});

test('rejects sub-hour duration and hybrid meeting modality', () => {
  assert.throws(() => service.validateMeeting({
    meeting: { duration_minutes: 90, modality: 'onsite', type: 'event' }
  }), { status: 422 });
  assert.throws(() => service.validateMeeting({
    meeting: { duration_minutes: 60, modality: 'hybrid', type: 'event' }
  }), { status: 422 });
});

test('rounds partial weekly blocks into conservative occupied slots', () => {
  const grid = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map(day => [day, Array(15).fill('OF')]));
  const warnings = [];
  service.markWeeklyBlock(grid, {
    weekdays: ['Monday'], start_time: '08:30', end_time: '10:00', modality: 'online'
  }, warnings);
  assert.deepEqual(grid.mon.slice(1, 3), ['OL', 'OL']);
  assert.ok(warnings.some(message => message.includes('partial-hour')));
});

test('maps Sunday out and rejects unknown weekly modality', () => {
  const grid = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map(day => [day, Array(15).fill('OF')]));
  const warnings = [];
  service.markWeeklyBlock(grid, {
    weekdays: ['Sunday'], start_time: '08:00', end_time: '09:00', modality: 'onsite'
  }, warnings);
  assert.ok(warnings.some(message => message.includes('Sunday')));
  assert.throws(() => service.markWeeklyBlock(grid, {
    weekdays: ['Monday'], start_time: '08:00', end_time: '09:00', modality: 'unknown'
  }, []), { status: 422 });
});

test('rejects active dated busy availability for the weekly-only model', () => {
  assert.doesNotThrow(() => service.ensureWeeklyOnlyAvailability([]));
  assert.throws(() => service.ensureWeeklyOnlyAvailability([{ id: 'busy-block' }]), {
    status: 503,
    message: /cannot be represented by the weekly model/
  });
});

test('validates returned candidates and relative scores', () => {
  const valid = {
    recommendations: [{ weekday: 'Tuesday', start_time: '10:00', end_time: '11:00', score: -0.2 }],
    model: { name: 'schedulaml-lgb', version: '1.1.0' }, warnings: []
  };
  assert.equal(service.validateServiceResponse(valid, 60), valid);
  assert.throws(() => service.validateServiceResponse({ ...valid, recommendations: [{ ...valid.recommendations[0], score: '0.2' }] }, 60), { status: 503 });
  assert.throws(() => service.validateServiceResponse({ ...valid, recommendations: [{ ...valid.recommendations[0], end_time: '12:00' }] }, 60), { status: 503 });
  const oneCandidate = {
    ...valid,
    recommendations: [{ ...valid.recommendations[0], score: null }],
    warnings: ['Only one feasible candidate remains; its layered score is not reliable.']
  };
  assert.equal(service.validateServiceResponse(oneCandidate, 60), oneCandidate);
  assert.throws(() => service.validateServiceResponse({ ...oneCandidate, warnings: [] }, 60), { status: 503 });
});

test('maps Python service failures and timeout to a safe 503', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('network down'); };
  try {
    await assert.rejects(
      service.requestRecommendations({}, { duration_minutes: 60 }, 5),
      { status: 503, message: 'Scheduling recommendations are temporarily unavailable' }
    );
  } finally {
    global.fetch = originalFetch;
  }
});
