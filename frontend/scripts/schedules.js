/** Weekly schedule builder backed by the schedules JSONB context. */
const SCHEDULE_TYPES = Object.freeze({ WEEKLY: 'weekly' });
const scheduleType = SCHEDULE_TYPES.WEEKLY;
const eventsList = document.getElementById('scheduledList');
const eventsDayFilter = document.getElementById('events-day-filter');
const unsavedBlocksTip = document.getElementById('unsaved-blocks-tip');
const unaddedBlockTip = document.getElementById('unadded-block-tip');
const blockFormInputIds = ['event-title', 'event-weekdays', 'event-modality', 'event-start', 'event-end', 'event-description'];
const scheduleSelector = document.getElementById('schedule-selector');
const scheduleNameInput = document.getElementById('schedule-name-input');
const scheduleExcelButton = document.getElementById('schedule-excel-btn');
const addEventButton = document.getElementById('add-event-btn');
const smartScheduleButton = document.getElementById('smart-schedule-btn');
const smartScheduleDialog = document.getElementById('smart-schedule-dialog');
const editWeeklyBlockDialog = document.getElementById('edit-weekly-block-dialog');
const editBlockTitleInput = document.getElementById('edit-block-title');
const editBlockWeekdayInput = document.getElementById('edit-block-weekday');
const editBlockModalityInput = document.getElementById('edit-block-modality');
const editBlockStartInput = document.getElementById('edit-block-start');
const editBlockEndInput = document.getElementById('edit-block-end');
const editBlockDescriptionInput = document.getElementById('edit-block-description');
const eventTitleInput = document.getElementById('event-title');
const eventModalityInput = document.getElementById('event-modality');
const smartScheduleTitle = document.getElementById('smart-schedule-title-input');
const smartScheduleModality = document.getElementById('smart-schedule-modality');
const smartScheduleDuration = document.getElementById('smart-schedule-duration-hours');
const smartScheduleType = document.getElementById('smart-schedule-type');
const smartScheduleGenerateButton = document.getElementById('smart-schedule-generate');
const smartScheduleStatus = document.getElementById('smart-schedule-status');
const smartScheduleModel = document.getElementById('smart-schedule-model');
const smartScheduleModelName = document.getElementById('smart-schedule-model-name');
const smartScheduleResults = document.getElementById('smart-schedule-results-list');
const smartScheduleWarnings = document.getElementById('smart-schedule-warnings');
const smartScheduleFooterHint = document.getElementById('smart-schedule-footer-hint');
const saveScheduleButton = document.getElementById('save-schedule-btn');
const deleteScheduleButton = document.getElementById('delete-schedule-btn');
const builderMessage = document.getElementById('builder-message');

let schedules = [];
let activeScheduleId = 'new';
let events = [];
let smartScheduleLoading = false;
let editingBlockIndex = null;

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

function setSmartScheduleStatus(message, isError = false) {
  smartScheduleStatus.textContent = message;
  smartScheduleStatus.classList.toggle('is-error', isError);
}

function resetSmartScheduleResults() {
  smartScheduleResults.replaceChildren();
  smartScheduleModel.hidden = true;
  smartScheduleModelName.textContent = '';
  smartScheduleWarnings.hidden = true;
  smartScheduleWarnings.textContent = '';
  smartScheduleFooterHint.hidden = true;
}

function updateSmartScheduleEligibility(showPrompt = true) {
  const missingTitle = !smartScheduleTitle.value.trim();
  const missingModality = !['onsite', 'online'].includes(smartScheduleModality.value);
  const missing = [];
  if (missingTitle) missing.push('a meeting title');
  if (missingModality) missing.push('a modality');

  smartScheduleGenerateButton.disabled = smartScheduleLoading || missing.length > 0;
  if (showPrompt && !smartScheduleLoading) {
    if (missing.length) {
      setSmartScheduleStatus(`Enter ${missing.join(' and ')} to unlock recommendations.`, true);
    } else {
      setSmartScheduleStatus('Title and modality are set. Choose a duration and type to show the ranked slots.');
    }
  }
  return missing;
}

function openSmartScheduleDialog() {
  resetSmartScheduleResults();
  smartScheduleTitle.value = eventTitleInput.value;
  smartScheduleModality.value = eventModalityInput.value;
  smartScheduleDialog.showModal();
  if (activeScheduleId === 'new') {
    setSmartScheduleStatus('Save this schedule before requesting suggestions.', true);
  } else {
    const savedSchedule = schedules.find(schedule => schedule.id === activeScheduleId);
    if (JSON.stringify(events) !== JSON.stringify(parseConfiguration(savedSchedule?.configuration))) {
      setSmartScheduleStatus('Save your latest weekly blocks before requesting suggestions.', true);
    } else {
      setSmartScheduleStatus('Choose a duration and meeting type, then show the top five times.');
    }
  }
  const missing = updateSmartScheduleEligibility(false);
  if (missing.length) {
    setSmartScheduleStatus(`Enter ${missing.join(' and ')} here before requesting recommendations.`, true);
    (missing.includes('a meeting title') ? smartScheduleTitle : smartScheduleModality).focus();
  } else {
    smartScheduleDuration.focus();
  }
}

smartScheduleTitle.addEventListener('input', () => {
  eventTitleInput.value = smartScheduleTitle.value;
  updateSmartScheduleEligibility();
});
smartScheduleModality.addEventListener('change', () => {
  eventModalityInput.value = smartScheduleModality.value;
  updateUnaddedBlockTip();
  updateSmartScheduleEligibility();
});

function chooseRecommendation(item, rank) {
  document.getElementById('event-weekdays').value = item.weekday;
  document.getElementById('event-start').value = item.start_time;
  document.getElementById('event-end').value = item.end_time;
  updateUnaddedBlockTip();
  smartScheduleDialog.close();
  setMessage('');
  document.getElementById('event-title').focus();
  const message = `Recommendation #${rank} selected: ${item.weekday}, ${item.start_time}–${item.end_time}. Review the block, then choose Add block to confirm.`;
  if (typeof window.noticePopup === 'function') window.noticePopup(message, 'Time selected');
  else showBuilderNotice(message, 'Time selected');
}

function renderRecommendations(data) {
  resetSmartScheduleResults();
  const recommendations = Array.isArray(data.recommendations) ? data.recommendations.slice(0, 5) : [];
  if (data.model && typeof data.model.name === 'string' && typeof data.model.version === 'string') {
    smartScheduleModelName.textContent = `${data.model.name} · version ${data.model.version}`;
    smartScheduleModel.hidden = false;
  }

  if (!recommendations.length) {
    setSmartScheduleStatus(data.warnings?.[0] || 'No feasible times were found for this schedule.', true);
    return;
  }

  smartScheduleFooterHint.hidden = false;
  setSmartScheduleStatus(`Choose one of the top ${recommendations.length} ranked times.`);
  recommendations.forEach((item, index) => {
    const rank = index + 1;
    const row = document.createElement('li');
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'smart-schedule-option';
    option.setAttribute('aria-label', `Choose recommendation ${rank}: ${item.weekday}, ${item.start_time} to ${item.end_time}`);

    const rankBadge = document.createElement('span');
    rankBadge.className = 'smart-schedule-rank';
    rankBadge.textContent = String(rank).padStart(2, '0');
    rankBadge.setAttribute('aria-hidden', 'true');

    const slot = document.createElement('span');
    slot.className = 'smart-schedule-slot';
    const day = document.createElement('strong');
    day.textContent = smartScheduleTitle.value.trim() || item.weekday;
    const time = document.createElement('span');
    const modalityLabel = smartScheduleModality.value === 'online' ? 'Online' : 'Onsite';
    time.textContent = `${item.weekday} · ${item.start_time}–${item.end_time} · ${modalityLabel}`;
    slot.append(day, time);

    const score = document.createElement('span');
    score.className = 'smart-schedule-score';
    score.textContent = Number.isFinite(item.score) ? `Score ${item.score.toFixed(3)}` : 'Ranked';

    const action = document.createElement('span');
    action.className = 'smart-schedule-choose';
    action.textContent = 'Choose';

    option.append(rankBadge, slot, score, action);
    option.addEventListener('click', () => chooseRecommendation(item, rank));
    row.appendChild(option);
    smartScheduleResults.appendChild(row);
  });

  if (data.warnings?.length) {
    smartScheduleWarnings.textContent = data.warnings.join(' ');
    smartScheduleWarnings.hidden = false;
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
  updateUnaddedBlockTip();
}

function updateUnaddedBlockTip() {
  if (!unaddedBlockTip) return;
  const hasFormDetails = blockFormInputIds.some(id => document.getElementById(id)?.value.trim());
  unaddedBlockTip.hidden = !hasFormDetails;
}

function formatBlock(block) {
  const modality = block.modality === 'online' ? 'Online' : 'Onsite';
  return `${block.weekdays.join(', ')} · ${block.start_time}–${block.end_time} · ${modality}`;
}

function renderEvents() {
  eventsList.setAttribute('aria-busy', 'false');
  eventsList.innerHTML = '';
  updateUnsavedBlocksTip();
  if (!events.length) {
    eventsList.innerHTML = '<p class="events-empty-state">No weekly blocks added yet.</p>';
    return;
  }
  const esc = window.APP_UTILS?.escapeHtml || (item => String(item ?? ''));
  const selectedDay = eventsDayFilter.value;
  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const days = selectedDay === 'all' ? dayOrder : [selectedDay];
  const visibleEvents = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => selectedDay === 'all' || event.weekdays.includes(selectedDay));

  if (!visibleEvents.length) {
    eventsList.innerHTML = `<p class="events-empty-state">No events scheduled for ${esc(selectedDay)}.</p>`;
    return;
  }

  days.forEach(day => {
    const dayEvents = visibleEvents.filter(({ event }) => event.weekdays.includes(day));
    if (!dayEvents.length) return;
    if (selectedDay === 'all') {
      const heading = document.createElement('h3');
      heading.className = 'event-day-heading';
      heading.textContent = day;
      eventsList.appendChild(heading);
    }
    dayEvents.sort((a, b) => a.event.start_time.localeCompare(b.event.start_time)
      || a.event.end_time.localeCompare(b.event.end_time)
      || a.event.title.localeCompare(b.event.title));
    dayEvents.forEach(({ event, index }) => {
      const card = document.createElement('article');
      card.className = 'event-card';
      card.dataset.weekday = day;
      const daySpecificEvent = { ...event, weekdays: [day] };
      card.innerHTML = `<div class="event-card-body"><div><h3 class="card-title-sm">${esc(event.title)}</h3><p class="card-text-main">${esc(formatBlock(daySpecificEvent))}</p><p class="card-text-sub">${esc(event.description || '')}</p></div><div class="event-card-actions"><button class="btn-primary btn-edit-inline" type="button" data-event-action="edit" data-event-index="${index}">EDIT</button><button class="btn-remove btn-remove-inline" type="button" data-event-action="remove" data-event-index="${index}"><img src="../assets/delete.png" alt="" class="btn-icon"> REMOVE</button></div></div>`;
      eventsList.appendChild(card);
    });
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

function hasUnsavedWeeklyBlocks() {
  if (activeScheduleId === 'new') return events.length > 0;
  const savedSchedule = schedules.find(schedule => schedule.id === activeScheduleId);
  const savedBlocks = parseConfiguration(savedSchedule?.configuration);
  return JSON.stringify(events) !== JSON.stringify(savedBlocks);
}

function updateUnsavedBlocksTip() {
  if (unsavedBlocksTip) unsavedBlocksTip.hidden = !hasUnsavedWeeklyBlocks();
}

let allowUnsavedNavigation = false;
let unsavedNavigationPromptOpen = false;

document.addEventListener('click', event => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest?.('a[href]');
  if (!link || link.target && link.target !== '_self' || link.hasAttribute('download')) return;
  if (!hasUnsavedWeeklyBlocks()) return;

  const destination = new URL(link.href, window.location.href);
  const current = new URL(window.location.href);
  if (!['http:', 'https:'].includes(destination.protocol)) return;
  if (destination.origin === current.origin
    && destination.pathname === current.pathname
    && destination.search === current.search) return;

  event.preventDefault();
  if (unsavedNavigationPromptOpen) return;
  unsavedNavigationPromptOpen = true;

  const leaveBuilder = () => {
    allowUnsavedNavigation = true;
    window.location.assign(destination.href);
  };
  const stayInBuilder = () => { unsavedNavigationPromptOpen = false; };
  const reminder = 'You have unsaved weekly blocks. Save your schedule before leaving. If you leave now, your changes will be lost.';
  if (typeof window.confirmPopup === 'function') {
    window.confirmPopup(reminder, leaveBuilder, stayInBuilder, 'Unsaved weekly blocks', 'warning');
  } else if (window.confirm(reminder)) {
    leaveBuilder();
  } else {
    stayInBuilder();
  }
}, true);

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

function openWeeklyBlockEditor(index) {
  const block = events[index];
  if (!block) return;
  editingBlockIndex = index;
  editBlockTitleInput.value = block.title;
  editBlockWeekdayInput.value = block.weekdays[0] || '';
  editBlockModalityInput.value = block.modality;
  editBlockStartInput.value = block.start_time;
  editBlockEndInput.value = block.end_time;
  editBlockDescriptionInput.value = block.description || '';
  editWeeklyBlockDialog.showModal();
  editBlockTitleInput.focus();
}

function showWeeklyBlockEditError(message, title) {
  const index = editingBlockIndex;
  const draft = {
    title: editBlockTitleInput.value,
    weekday: editBlockWeekdayInput.value,
    modality: editBlockModalityInput.value,
    start: editBlockStartInput.value,
    end: editBlockEndInput.value,
    description: editBlockDescriptionInput.value
  };
  if (editWeeklyBlockDialog.open) editWeeklyBlockDialog.close();
  showBuilderNotice(message.startsWith('Error:') || message.toLowerCase().includes('conflict') ? message : `Error: ${message}`, title);
  const popup = document.querySelector('.custom-modal-overlay');
  let resumed = false;
  let escapeHandler;
  const resumeEditor = () => {
    if (resumed) return;
    resumed = true;
    if (escapeHandler) document.removeEventListener('keydown', escapeHandler);
    window.setTimeout(() => {
      if (!events[index]) return;
      editingBlockIndex = index;
      editBlockTitleInput.value = draft.title;
      editBlockWeekdayInput.value = draft.weekday;
      editBlockModalityInput.value = draft.modality;
      editBlockStartInput.value = draft.start;
      editBlockEndInput.value = draft.end;
      editBlockDescriptionInput.value = draft.description;
      editWeeklyBlockDialog.showModal();
      editBlockTitleInput.focus();
    }, 310);
  };
  popup?.querySelector('.custom-modal-actions button')?.addEventListener('click', resumeEditor, { once: true });
  popup?.addEventListener('click', event => { if (event.target === popup) resumeEditor(); }, { once: true });
  escapeHandler = function reopenAfterEscape(event) {
    if (event.key !== 'Escape') return;
    resumeEditor();
  };
  document.addEventListener('keydown', escapeHandler);
}

function saveWeeklyBlockEdit() {
  const index = editingBlockIndex;
  const original = events[index];
  if (!original) { editWeeklyBlockDialog.close(); return; }
  const updated = {
    ...original,
    title: editBlockTitleInput.value.trim(),
    weekdays: [editBlockWeekdayInput.value].filter(Boolean),
    modality: editBlockModalityInput.value,
    start_time: editBlockStartInput.value,
    end_time: editBlockEndInput.value,
    description: editBlockDescriptionInput.value.trim()
  };
  const error = validateBlock(updated);
  if (error) {
    showWeeklyBlockEditError(error, 'Weekly block details required');
    return;
  }
  const conflict = findBlockConflict(updated, events.filter((_, eventIndex) => eventIndex !== index));
  if (conflict) {
    const weekday = updated.weekdays.find(day => conflict.weekdays.includes(day));
    showWeeklyBlockEditError(`This block overlaps “${conflict.title}” on ${weekday}.`, 'Schedule conflict');
    return;
  }
  events[index] = updated;
  editingBlockIndex = null;
  renderEvents();
  editWeeklyBlockDialog.close();
  if (typeof window.successPopup === 'function') {
    window.successPopup('Weekly block updated. Save the schedule to sync your changes.', 'Weekly block updated');
  } else {
    showBuilderNotice('Weekly block updated. Save the schedule to sync your changes.', 'Weekly block updated');
  }
  updateSmartScheduleEligibility(false);
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
blockFormInputIds.forEach(id => {
  const input = document.getElementById(id);
  input?.addEventListener('input', updateUnaddedBlockTip);
  input?.addEventListener('change', updateUnaddedBlockTip);
});
scheduleExcelButton.addEventListener('click', () => {
  window.SchedulaScheduleExcel.open({
    getExistingEvents: () => events,
    onImport: importScheduleEvents
  });
});
addEventButton.addEventListener('click', addEvent);
smartScheduleButton.addEventListener('click', openSmartScheduleDialog);
document.getElementById('smart-schedule-cancel').addEventListener('click', () => smartScheduleDialog.close());
smartScheduleDialog.addEventListener('click', event => {
  if (event.target === smartScheduleDialog) smartScheduleDialog.close();
});
smartScheduleGenerateButton.addEventListener('click', async () => {
  if (smartScheduleGenerateButton.disabled) return;
  if (activeScheduleId === 'new') {
    setSmartScheduleStatus('Save this schedule before requesting suggestions.', true);
    return;
  }
  const savedSchedule = schedules.find(schedule => schedule.id === activeScheduleId);
  const currentSnapshot = JSON.stringify(events);
  const savedSnapshot = JSON.stringify(parseConfiguration(savedSchedule?.configuration));
  if (currentSnapshot !== savedSnapshot) {
    setSmartScheduleStatus('Save your latest weekly blocks before requesting suggestions.', true);
    return;
  }
  const durationHours = Number(smartScheduleDuration.value);
  const type = smartScheduleType.value;
  const title = smartScheduleTitle.value.trim();
  const modality = smartScheduleModality.value;
  if (!title) {
    setSmartScheduleStatus('Enter a title before requesting suggestions.', true);
    smartScheduleTitle.focus();
    updateSmartScheduleEligibility(false);
    return;
  }
  if (!['onsite', 'online'].includes(modality)) {
    setSmartScheduleStatus('Choose onsite or online before requesting suggestions.', true);
    smartScheduleModality.focus();
    updateSmartScheduleEligibility(false);
    return;
  }
  if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 15) {
    setSmartScheduleStatus('Choose a meeting duration from 1 to 15 hours.', true);
    smartScheduleDuration.focus();
    return;
  }
  if (!['project', 'event', 'meeting'].includes(type)) {
    setSmartScheduleStatus('Choose Project, Event, or Meeting.', true);
    smartScheduleType.focus();
    return;
  }

  eventTitleInput.value = title;
  eventModalityInput.value = modality;
  smartScheduleLoading = true;
  updateSmartScheduleEligibility(false);
  smartScheduleGenerateButton.textContent = 'Finding times…';
  smartScheduleGenerateButton.setAttribute('aria-busy', 'true');
  [smartScheduleTitle, smartScheduleModality, smartScheduleDuration, smartScheduleType].forEach(input => { input.disabled = true; });
  smartScheduleModel.hidden = true;
  smartScheduleResults.replaceChildren();
  smartScheduleWarnings.hidden = true;
  setSmartScheduleStatus('Finding the top five available times…');
  try {
    const data = await requestJson(`/schedules/${encodeURIComponent(activeScheduleId)}/recommendations`, {
      method: 'POST',
      body: JSON.stringify({ meeting: { duration_minutes: durationHours * 60, modality, type }, limit: 5 })
    });
    if (JSON.stringify(events) !== currentSnapshot || activeScheduleId !== savedSchedule?.id) {
      setSmartScheduleStatus('Your schedule changed while suggestions were loading. Save it and request fresh suggestions.', true);
      return;
    }
    const activeConflict = data.recommendations?.some(item => {
      const candidate = {
        weekdays: [item.weekday], start_time: item.start_time, end_time: item.end_time
      };
      return Boolean(findBlockConflict(candidate, events));
    });
    if (activeConflict) {
      setSmartScheduleStatus('The schedule now conflicts with these suggestions. Save the latest schedule and request fresh suggestions.', true);
      return;
    }
    renderRecommendations(data);
  } catch (error) {
    setSmartScheduleStatus(`${error.message} Please retry.`, true);
  } finally {
    smartScheduleLoading = false;
    [smartScheduleTitle, smartScheduleModality, smartScheduleDuration, smartScheduleType].forEach(input => { input.disabled = false; });
    smartScheduleGenerateButton.textContent = 'Show the Best 5 Slots';
    updateSmartScheduleEligibility(false);
    smartScheduleGenerateButton.removeAttribute('aria-busy');
  }
});
saveScheduleButton.addEventListener('click', saveSchedule);
eventsList.addEventListener('click', event => {
  const button = event.target.closest('[data-event-action]');
  if (!button) return;
  const index = Number(button.dataset.eventIndex);
  if (!Number.isInteger(index) || index < 0 || index >= events.length) return;

  if (button.dataset.eventAction === 'edit') {
    openWeeklyBlockEditor(index);
    return;
  }
  if (button.dataset.eventAction !== 'remove') return;

  const removeBlock = () => {
    events.splice(index, 1);
    renderEvents();
  };
  const message = 'Remove this weekly block from the schedule? This change will be saved only when you save the schedule.';
  if (typeof window.confirmPopup === 'function') {
    window.confirmPopup(message, removeBlock, null, 'Remove weekly block', 'warning');
  } else if (window.confirm(message)) {
    removeBlock();
  }
});
document.getElementById('edit-block-cancel').addEventListener('click', () => {
  editingBlockIndex = null;
  editWeeklyBlockDialog.close();
});
document.getElementById('edit-block-save').addEventListener('click', saveWeeklyBlockEdit);
editWeeklyBlockDialog.addEventListener('click', event => {
  if (event.target === editWeeklyBlockDialog) {
    editingBlockIndex = null;
    editWeeklyBlockDialog.close();
  }
});
editWeeklyBlockDialog.addEventListener('close', () => { editingBlockIndex = null; });
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
  try { await loadSchedules(); } catch (error) {
    eventsList.setAttribute('aria-busy', 'false');
    eventsList.innerHTML = `<p class="text-muted-light">${window.APP_UTILS?.escapeHtml(error.message) || 'Unable to load schedules.'}</p>`;
    setMessage(error.message, true);
    showBuilderNotice(error.message, 'Unable to load schedules');
  }
});
