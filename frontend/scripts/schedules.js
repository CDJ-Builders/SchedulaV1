/** Weekly schedule builder backed by the schedules JSONB context. */
const SCHEDULE_TYPES = Object.freeze({ WEEKLY: 'weekly' });
const scheduleType = SCHEDULE_TYPES.WEEKLY;
const eventsList = document.getElementById('scheduledList');
const eventsDayFilter = document.getElementById('events-day-filter');
const scheduleSelector = document.getElementById('schedule-selector');
const scheduleNameInput = document.getElementById('schedule-name-input');
const scheduleExcelButton = document.getElementById('schedule-excel-btn');
const addEventButton = document.getElementById('add-event-btn');
const smartScheduleButton = document.getElementById('smart-schedule-btn');
const smartScheduleResults = document.getElementById('smart-schedule-results');
const saveScheduleButton = document.getElementById('save-schedule-btn');
const deleteScheduleButton = document.getElementById('delete-schedule-btn');
const builderMessage = document.getElementById('builder-message');

let schedules = [];
let activeScheduleId = 'new';
let events = [];

function tokenHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

function setMessage(message, isError = false) {
  builderMessage.textContent = message;
  builderMessage.classList.toggle('text-error-center', isError);
}

function showBuilderNotice(message, title) {
  if (typeof window.noticePopup === 'function') {
    window.noticePopup(message, title);
    return;
  }
  const existing = document.querySelector('.builder-notice-fallback');
  if (existing) existing.remove();
  const notice = document.createElement('div');
  notice.className = 'custom-modal-overlay builder-notice-fallback active';
  notice.innerHTML = `
    <div class="custom-modal" role="dialog" aria-modal="true" aria-labelledby="builder-notice-title">
      <div class="custom-modal-title warning-text" id="builder-notice-title">${title || 'Notice'}</div>
      <div class="custom-modal-body">${message}</div>
      <div class="custom-modal-actions">
        <button class="custom-modal-btn warning" type="button">OK</button>
      </div>
    </div>`;
  document.body.appendChild(notice);
  const close = () => notice.remove();
  notice.querySelector('button').addEventListener('click', close);
  notice.addEventListener('click', event => {
    if (event.target === notice) close();
  });
}

function renderSmartScheduleState(message, isError = false) {
  smartScheduleResults.replaceChildren();
  smartScheduleResults.textContent = message;
  smartScheduleResults.classList.toggle('text-error-center', isError);
}

function chooseRecommendation(item) {
  document.getElementById('event-weekdays').value = item.weekday;
  document.getElementById('event-start').value = item.start_time;
  document.getElementById('event-end').value = item.end_time;
  renderSmartScheduleState(`${item.weekday}, ${item.start_time}–${item.end_time} selected. Review the form, then choose Add block to confirm.`);
  document.getElementById('event-title').focus();
}

function renderRecommendations(data) {
  smartScheduleResults.replaceChildren();
  if (!data.recommendations.length) {
    renderSmartScheduleState(data.warnings?.[0] || 'No feasible times were found.');
    return;
  }
  const heading = document.createElement('p');
  heading.textContent = 'Suggested times (scores are relative rankings):';
  smartScheduleResults.appendChild(heading);
  const list = document.createElement('ul');
  list.className = 'smart-schedule-options';
  data.recommendations.forEach(item => {
    const row = document.createElement('li');
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'smart-schedule-option';
    option.textContent = `${item.weekday} · ${item.start_time}–${item.end_time}`;
    option.addEventListener('click', () => chooseRecommendation(item));
    row.appendChild(option);
    list.appendChild(row);
  });
  smartScheduleResults.appendChild(list);
  if (data.warnings?.length) {
    const warning = document.createElement('p');
    warning.textContent = data.warnings.join(' ');
    smartScheduleResults.appendChild(warning);
  }
}

function value(id) {
  return document.getElementById(id)?.value.trim() || '';
}

function selectedWeekdays() {
  const weekday = document.getElementById('event-weekdays').value;
  return weekday ? [weekday] : [];
}

function eventFromForm() {
  return {
    title: value('event-title'),
    description: value('event-description'),
    weekdays: selectedWeekdays(),
    start_time: value('event-start'),
    end_time: value('event-end'),
    modality: value('event-modality')
  };
}

function validateBlock(block) {
  if (!block.title || !block.start_time || !block.end_time) return 'Title, start time, and end time are required.';
  if (!['onsite', 'online'].includes(block.modality)) return 'Choose whether this event is onsite or online.';
  if (block.weekdays.length !== 1) return 'Select one weekday.';
  if (block.end_time <= block.start_time) return 'End time must be later than start time.';
  return null;
}

function findBlockConflict(block, otherBlocks) {
  return otherBlocks.find(existing =>
    block.weekdays.some(day => existing.weekdays.includes(day))
    && block.start_time < existing.end_time
    && block.end_time > existing.start_time
  ) || null;
}

function findScheduleConflict(blocks) {
  for (let index = 0; index < blocks.length; index += 1) {
    const conflict = findBlockConflict(blocks[index], blocks.slice(0, index));
    if (conflict) {
      const weekday = blocks[index].weekdays.find(day => conflict.weekdays.includes(day));
      return `“${blocks[index].title}” overlaps “${conflict.title}” on ${weekday}.`;
    }
  }
  return null;
}

function clearEventForm() {
  ['event-title', 'event-start', 'event-end', 'event-description'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('event-weekdays').value = '';
  document.getElementById('event-modality').value = '';
}

function formatBlock(block) {
  const modality = block.modality === 'online' ? 'Online' : 'Onsite';
  return `${block.weekdays.join(', ')} · ${block.start_time}–${block.end_time} · ${modality}`;
}

function renderEvents() {
  eventsList.setAttribute('aria-busy', 'false');
  eventsList.innerHTML = '';
  if (!events.length) {
    eventsList.innerHTML = '<p class="events-empty-state">No weekly blocks added yet.</p>';
    return;
  }
  const esc = window.APP_UTILS?.escapeHtml || (item => String(item ?? ''));
  const selectedDay = eventsDayFilter.value;
  const visibleEvents = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => selectedDay === 'all' || event.weekdays.includes(selectedDay));

  if (!visibleEvents.length) {
    eventsList.innerHTML = `<p class="events-empty-state">No events scheduled for ${esc(selectedDay)}.</p>`;
    return;
  }

  visibleEvents.forEach(({ event, index }) => {
    const card = document.createElement('article');
    card.className = 'event-card';
    card.dataset.weekday = event.weekdays[0] || '';
    card.innerHTML = `<div class="event-card-body card-body-flex"><div><h3 class="card-title-sm">${esc(event.title)}</h3><p class="card-text-main">${esc(formatBlock(event))}</p><p class="card-text-sub">${esc(event.description || '')}</p></div><button class="btn-remove btn-remove-inline" type="button" data-event-key="new-${index}"><img src="../assets/delete.png" alt="" class="btn-icon"> REMOVE</button></div>`;
    eventsList.appendChild(card);
  });
}

async function requestJson(url, options = {}) {
  let response;
  try {
    response = await fetch(`${window.APP_CONFIG.API_BASE}${url}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...tokenHeaders(), ...(options.headers || {}) }
    });
  } catch (error) {
    throw new Error('Unable to reach the schedule server. Make sure the backend is running and try again.');
  }
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const retryAfter = response.headers.get('Retry-After');
    const message = data?.error || 'Request failed';
    throw new Error(retryAfter ? `${message} Retry in ${retryAfter} seconds.` : message);
  }
  return data;
}

function parseConfiguration(configuration) {
  if (typeof configuration === 'string') {
    try { configuration = JSON.parse(configuration); } catch { return []; }
  }
  if (!Array.isArray(configuration)) return [];
  return configuration.filter(block => block && typeof block === 'object').map(block => ({
    title: typeof block.title === 'string' ? block.title : '',
    description: typeof block.description === 'string' ? block.description : '',
    weekdays: Array.isArray(block.weekdays) ? block.weekdays.filter(day => typeof day === 'string') : [],
    start_time: typeof block.start_time === 'string' ? block.start_time : '',
    end_time: typeof block.end_time === 'string' ? block.end_time : '',
    modality: block.modality === 'online' ? 'online' : 'onsite'
  })).filter(block => !validateBlock(block));
}

function selectSchedule(id) {
  activeScheduleId = id;
  const selected = schedules.find(schedule => schedule.id === id);
  events = parseConfiguration(selected?.configuration);
  scheduleNameInput.value = selected?.title || 'My schedule';
  deleteScheduleButton.style.display = 'inline-flex';
  renderEvents();
}

async function loadSchedules() {
  schedules = await requestJson('/schedules');
  scheduleSelector.innerHTML = '<option value="new">+ Create new schedule</option>';
  schedules.forEach(schedule => {
    const option = document.createElement('option');
    option.value = schedule.id;
    option.textContent = schedule.title;
    scheduleSelector.appendChild(option);
  });
  if (activeScheduleId !== 'new' && schedules.some(schedule => schedule.id === activeScheduleId)) {
    scheduleSelector.value = activeScheduleId;
  } else if (schedules.length) {
    activeScheduleId = schedules[0].id;
    scheduleSelector.value = activeScheduleId;
  }
  selectSchedule(activeScheduleId);
}

function addEvent() {
  const block = eventFromForm();
  const error = validateBlock(block);
  if (error) { showBuilderNotice(error, 'Weekly block details required'); return; }
  const conflict = findBlockConflict(block, events);
  if (conflict) {
    const weekday = block.weekdays.find(day => conflict.weekdays.includes(day));
    showBuilderNotice(`This block overlaps “${conflict.title}” on ${weekday}.`, 'Schedule conflict');
    return;
  }
  events.push(block);
  renderEvents();
  clearEventForm();
  showBuilderNotice('Weekly block added. Save the schedule to sync it.', 'Weekly block added');
}

async function saveSchedule() {
  if (!events.length) {
    showBuilderNotice('Add at least one weekly block before saving.', 'Schedule is empty');
    return;
  }
  const title = scheduleNameInput.value.trim();
  if (!title) {
    showBuilderNotice('Enter a schedule title before saving.', 'Schedule title required');
    scheduleNameInput.focus();
    return;
  }
  const conflict = findScheduleConflict(events);
  if (conflict) {
    showBuilderNotice(conflict, 'Schedule conflict');
    return;
  }
  try {
    await persistSchedule(events, title);
    await loadSchedules();
    if (typeof window.successPopup === 'function') {
      window.successPopup('Schedule saved successfully.', 'Schedule saved');
    } else {
      showBuilderNotice('Schedule saved successfully.', 'Schedule saved');
    }
  } catch (error) {
    setMessage(error.message, true);
    showBuilderNotice(error.message, 'Unable to save schedule');
  }
}

async function persistSchedule(configuration, title) {
  let scheduleId = activeScheduleId;
  let createdScheduleId = null;
  if (scheduleId === 'new') {
    scheduleId = (await requestJson('/schedules', {
      method: 'POST',
      body: JSON.stringify({ title, schedule_type: scheduleType })
    })).id;
    createdScheduleId = scheduleId;
  }

  try {
    await requestJson(`/schedules/${scheduleId}`, {
      method: 'PUT',
      body: JSON.stringify({ title, schedule_type: scheduleType, configuration })
    });
  } catch (error) {
    if (createdScheduleId) {
      try {
        await requestJson(`/schedules/${createdScheduleId}`, { method: 'DELETE' });
      } catch (cleanupError) {
        throw new Error(`${error.message} The empty schedule could not be cleaned up: ${cleanupError.message}`);
      }
    }
    throw error;
  }

  activeScheduleId = scheduleId;
  const cachedSchedule = schedules.find(schedule => schedule.id === scheduleId);
  if (cachedSchedule) {
    cachedSchedule.title = title;
    cachedSchedule.configuration = configuration;
  } else {
    schedules.push({ id: scheduleId, title, configuration });
  }
  let option = [...scheduleSelector.options].find(item => item.value === scheduleId);
  if (!option) {
    option = document.createElement('option');
    option.value = scheduleId;
    scheduleSelector.appendChild(option);
  }
  option.textContent = title;
  scheduleSelector.value = scheduleId;
}

async function importScheduleEvents(importedEvents) {
  const title = scheduleNameInput.value.trim();
  if (!title) throw new Error('Enter a schedule title before importing events.');

  const previousEvents = events;
  const nextEvents = [...events, ...importedEvents];
  events = nextEvents;
  renderEvents();
  try {
    await persistSchedule(nextEvents, title);
  } catch (error) {
    events = previousEvents;
    renderEvents();
    throw error;
  }
}

scheduleSelector.addEventListener('change', event => selectSchedule(event.target.value));
eventsDayFilter.addEventListener('change', renderEvents);
scheduleExcelButton.addEventListener('click', () => {
  window.SchedulaScheduleExcel.open({
    getExistingEvents: () => events,
    onImport: importScheduleEvents
  });
});
addEventButton.addEventListener('click', addEvent);
smartScheduleButton.addEventListener('click', async () => {
  if (smartScheduleButton.disabled) return;
  if (activeScheduleId === 'new') {
    renderSmartScheduleState('Save this schedule before requesting suggestions.', true);
    return;
  }
  const savedSchedule = schedules.find(schedule => schedule.id === activeScheduleId);
  const currentSnapshot = JSON.stringify(events);
  const savedSnapshot = JSON.stringify(parseConfiguration(savedSchedule?.configuration));
  if (currentSnapshot !== savedSnapshot) {
    renderSmartScheduleState('Save your latest weekly blocks before requesting suggestions.', true);
    return;
  }
  const durationHours = Number(document.getElementById('event-duration-hours').value);
  const type = document.getElementById('event-type').value;
  const modality = document.getElementById('event-modality').value;
  if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 15) {
    renderSmartScheduleState('Choose a whole-hour duration from 1 to 15.', true);
    document.getElementById('event-duration-hours').focus();
    return;
  }
  if (!['project', 'event', 'meeting'].includes(type)) {
    renderSmartScheduleState('Choose Project, Event, or Meeting for Smart Schedule.', true);
    document.getElementById('event-type').focus();
    return;
  }
  if (!['onsite', 'online'].includes(modality)) {
    renderSmartScheduleState('Choose a meeting modality before requesting suggestions.', true);
    document.getElementById('event-modality').focus();
    return;
  }

  smartScheduleButton.disabled = true;
  smartScheduleButton.setAttribute('aria-busy', 'true');
  renderSmartScheduleState('Finding available times…');
  try {
    const data = await requestJson(`/schedules/${encodeURIComponent(activeScheduleId)}/recommendations`, {
      method: 'POST',
      body: JSON.stringify({ meeting: { duration_minutes: durationHours * 60, modality, type }, limit: 5 })
    });
    if (JSON.stringify(events) !== currentSnapshot || activeScheduleId !== savedSchedule?.id) {
      renderSmartScheduleState('Your schedule changed while suggestions were loading. Save it and request fresh suggestions.', true);
      return;
    }
    const activeConflict = data.recommendations?.some(item => {
      const candidate = {
        weekdays: [item.weekday], start_time: item.start_time, end_time: item.end_time
      };
      return Boolean(findBlockConflict(candidate, events));
    });
    if (activeConflict) {
      renderSmartScheduleState('The schedule now conflicts with these suggestions. Save the latest schedule and request fresh suggestions.', true);
      return;
    }
    renderRecommendations(data);
  } catch (error) {
    renderSmartScheduleState(`${error.message} You can retry Smart Schedule.`, true);
  } finally {
    smartScheduleButton.disabled = false;
    smartScheduleButton.removeAttribute('aria-busy');
  }
});
saveScheduleButton.addEventListener('click', saveSchedule);
eventsList.addEventListener('click', event => {
  const button = event.target.closest('[data-event-key]');
  if (!button) return;
  const index = Number(button.dataset.eventKey.slice(4));
  events.splice(index, 1);
  renderEvents();
}); 
deleteScheduleButton.addEventListener('click', () => {
  if (activeScheduleId === 'new') {
    showBuilderNotice('Select an existing schedule before deleting.', 'Schedule selection required');
    return;
  }
  if (typeof window.confirmPopup !== 'function') {
    showBuilderNotice('The confirmation dialog is unavailable. Reload the page and try again.', 'Unable to delete schedule');
    return;
  }
  window.confirmPopup(
    'Warning: This will permanently delete the schedule and all of its weekly blocks. This action cannot be undone.',
    async () => {
      try {
        await requestJson(`/schedules/${activeScheduleId}`, { method: 'DELETE' });
        activeScheduleId = 'new';
        await loadSchedules();
      } catch (error) {
        setMessage(error.message, true);
        showBuilderNotice(error.message, 'Unable to delete schedule');
      }
    },
    null,
    'Delete schedule?',
    'warning'
  );
});

document.addEventListener('DOMContentLoaded', async () => {
  if (!localStorage.getItem('token')) { window.location.href = 'login.html'; return; }
  try { await loadSchedules();   } catch (error) {
    eventsList.setAttribute('aria-busy', 'false');
    eventsList.innerHTML = `<p class="text-muted-light">${window.APP_UTILS?.escapeHtml(error.message) || 'Unable to load schedules.'}</p>`;
    setMessage(error.message, true);
    showBuilderNotice(error.message, 'Unable to load schedules');
  }
});
