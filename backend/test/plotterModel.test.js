'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../../frontend/scripts/plotterModel');
const { normalizeConfiguration } = require('../services/scheduleService');

test('resolveBlockStyle combines batch defaults, block fields, and overrides', () => {
  const style = Model.resolveBlockStyle({ title: 'Math', notes: '', overrides: { title: 'Algebra', color: '#123456' } }, { color: '#ffffff', fontColor: '#222222' });
  assert.deepEqual(style, { color: '#123456', fontColor: '#222222', title: 'Algebra', description: '', notes: '' });
});

test('batch updates change defaults and preserve overrides unless overwrite is enabled', () => {
  const blocks = [{ id: 'a', title: 'A', overrides: { color: '#111111' } }, { id: 'b', title: 'B' }];
  const defaults = { color: '#ffffff', fontColor: '#000000' };
  const skipped = Model.applyBatch(blocks, defaults, { color: '#abcdef' }, { skipOverridden: true });
  assert.equal(skipped.batchDefaults.color, '#abcdef');
  assert.equal(skipped.blocks[0].overrides.color, '#111111');
  assert.equal(skipped.blocks[1].overrides, undefined);
  assert.equal(Model.resolveBlockStyle(skipped.blocks[0], skipped.batchDefaults).color, '#111111');
  assert.equal(Model.resolveBlockStyle(skipped.blocks[1], skipped.batchDefaults).color, '#abcdef');
  const overwritten = Model.applyBatch(blocks, defaults, { color: '#abcdef' }, { skipOverridden: false });
  assert.equal(overwritten.batchDefaults.color, '#abcdef');
  assert.equal(overwritten.blocks[0].overrides, undefined);
});

test('per-field and all-field reset clear only requested overrides', () => {
  const blocks = [{ id: 'a', title: 'A', overrides: { color: '#111111', title: 'Custom' } }];
  const one = Model.clearBlockOverride(blocks, 'a', 'color');
  assert.deepEqual(one[0].overrides, { title: 'Custom' });
  const all = Model.clearBlockOverride(one, 'a');
  assert.equal(all[0].overrides, undefined);
});

test('setting an inherited value does not store a redundant override', () => {
  const defaults = { color: '#ffffff', fontColor: '#222222' };
  const blocks = Model.setBlockOverride([{ id: 'a', title: 'A' }], 'a', { color: '#ffffff' }, defaults);
  assert.equal(blocks[0].overrides, undefined);
});

test('legacy block configuration remains valid without IDs or overrides', () => {
  const [block] = normalizeConfiguration([{ title: 'Class', description: '', weekdays: ['Monday'], start_time: '09:00', end_time: '10:00', modality: 'onsite' }]);
  assert.equal(block.title, 'Class');
  assert.equal(block.id, undefined);
  assert.equal(block.overrides, undefined);
});

test('configuration validation preserves valid overrides and rejects invalid styles', () => {
  const [block] = normalizeConfiguration([{ id: 'block-1', title: 'Class', description: '', weekdays: ['Monday'], start_time: '09:00', end_time: '10:00', modality: 'onsite', overrides: { color: '#aabbcc', title: 'Lab' } }]);
  assert.deepEqual(block.overrides, { color: '#aabbcc', title: 'Lab' });
  assert.throws(() => normalizeConfiguration([{ title: 'Class', weekdays: ['Monday'], start_time: '09:00', end_time: '10:00', overrides: { color: 'red' } }]), /six-digit hex color/);
  assert.throws(() => normalizeConfiguration([{ title: 'Class', weekdays: ['Monday'], start_time: '09:00', end_time: '10:00', overrides: { unexpected: 'value' } }]), /Unsupported block override/);
});
