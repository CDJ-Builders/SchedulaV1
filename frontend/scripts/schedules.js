/** Weekly schedule builder backed by the schedules JSONB context. */
const SCHEDULES_API_BASE = window.APP_CONFIG ? window.APP_CONFIG.API_BASE : 'http://localhost:3000/api';
const SCHEDULE_TYPES = Object.freeze({ WEEKLY: 'weekly' });
const scheduleType = SCHEDULE_TYPES.WEEKLY;
const eventsList = document.getElementById('scheduledList');
const scheduleSelector = document.getElementById('schedule-selector');
const scheduleNameInput = document.getElementById('schedule-name-input');
const addEventButton = document.getElementById('add-event-btn');
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
    end_time: value('event-end')
  };
}

function validateBlock(block) {
  if (!block.title || !block.start_time || !block.end_time) return 'Title, start time, and end time are required.';
  if (block.weekdays.length !== 1) return 'Select one weekday.';
  if (block.end_time <= block.start_time) return 'End time must be later than start time.';
  return null;
}

function clearEventForm() {
  ['event-title', 'event-start', 'event-end', 'event-description'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('event-weekdays').value = '';
}

function formatBlock(block) {
  return `${block.weekdays.join(', ')} · ${block.start_time}–${block.end_time}`;
}

function renderEvents() {
  eventsList.innerHTML = '';
  if (!events.length) {
    eventsList.innerHTML = '<p class="text-muted-light">No weekly blocks added yet.</p>';
    return;
  }
  const esc = window.APP_UTILS?.escapeHtml || (item => String(item ?? ''));
  events.forEach((event, index) => {
    const card = document.createElement('article');
    card.className = 'event-card';
    card.innerHTML = `<div class="event-card-body card-body-flex"><div><h3 class="card-title-sm">${esc(event.title)}</h3><p class="card-text-main">${esc(formatBlock(event))}</p><p class="card-text-sub">${esc(event.description || '')}</p></div><button class="btn-remove btn-remove-inline" type="button" data-event-key="new-${index}"><img src="../assets/delete.png" alt="" class="btn-icon"> REMOVE</button></div>`;
    eventsList.appendChild(card);
  });
}

async function requestJson(url, options = {}) {
  let response;
  try {
    response = await fetch(`${SCHEDULES_API_BASE}${url}`, {
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
    end_time: typeof block.end_time === 'string' ? block.end_time : ''
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
  try {
    let scheduleId = activeScheduleId;
    if (scheduleId === 'new') {
      scheduleId = (await requestJson('/schedules', {
        method: 'POST',
        body: JSON.stringify({ title, schedule_type: scheduleType })
      })).id;
    }
    await requestJson(`/schedules/${scheduleId}`, {
      method: 'PUT',
      body: JSON.stringify({ title, schedule_type: scheduleType, configuration: events })
    });
    activeScheduleId = scheduleId;
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

scheduleSelector.addEventListener('change', event => selectSchedule(event.target.value));
addEventButton.addEventListener('click', addEvent);
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
  window.confirmPopup('Delete this schedule and its weekly blocks? This cannot be undone.', async () => {
    try {
      await requestJson(`/schedules/${activeScheduleId}`, { method: 'DELETE' });
      activeScheduleId = 'new';
      await loadSchedules();
    } catch (error) {
      setMessage(error.message, true);
      showBuilderNotice(error.message, 'Unable to delete schedule');
    }
  }, null, 'Delete schedule', 'error');
});

document.addEventListener('DOMContentLoaded', async () => {
  if (!localStorage.getItem('token')) { window.location.href = 'login.html'; return; }
  try { await loadSchedules();   } catch (error) {
    setMessage(error.message, true);
    showBuilderNotice(error.message, 'Unable to load schedules');
  }
});
