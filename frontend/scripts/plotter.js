/** Renders weekly JSONB schedule blocks and legacy relational events. */
document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');
  if (!token) { window.location.href = 'login.html'; return; }

  const list = document.getElementById('plotter-schedule-list');
  const generateButton = document.getElementById('btn-generate');
  const saveButton = document.getElementById('btn-save-png');
  const blocks = document.getElementById('blocks-container');
  const hideDetails = document.getElementById('hide-prof');
  const hideCategory = document.getElementById('hide-code');
  const hideTitle = document.getElementById('hide-name');
  const hideTime = document.getElementById('hide-time');
  const hideDay = document.getElementById('hide-day');
  const hideLocation = document.getElementById('hide-location');
  const colorInput = document.getElementById('custom-color');
  const fontColorInput = document.getElementById('custom-font-color');
  const timeLabels = document.getElementById('plotter-time-labels');
  const dayGrid = document.querySelector('.day-columns-grid');
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const dayStartMinutes = 7 * 60;
  let schedules = [];
  let selectedSchedule = null;
  let latestEventEnd = null;

  async function loadSchedules() {
    const response = await fetch(`${window.APP_CONFIG.API_BASE}/schedules`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error('Failed to load schedules');
    schedules = await response.json();
    renderScheduleList();
  }

  function renderScheduleList() {
    list.setAttribute('aria-busy', 'false');
    list.innerHTML = '';
    if (!schedules.length) {
      list.innerHTML = '<div class="plotter-schedule-item"><span>No schedules found.</span></div>';
      return;
    }
    schedules.forEach(schedule => {
      const item = document.createElement('div');
      item.className = 'plotter-schedule-item';
      const name = document.createElement('span');
      name.textContent = schedule.title;
      const button = document.createElement('button');
      button.className = 'btn-select';
      button.textContent = 'SELECT';
      button.addEventListener('click', () => {
        selectedSchedule = schedule;
        document.querySelectorAll('.plotter-schedule-item .btn-select').forEach(node => {
          node.classList.remove('selected');
          node.textContent = 'SELECT';
        });
        button.classList.add('selected');
        button.textContent = 'SELECTED';
      });
      item.append(name, button);
      list.appendChild(item);
    });
  }

  function parseJsonValue(value) {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return null; }
  }

  function weeklyBlocks(schedule) {
    const configuration = parseJsonValue(schedule?.configuration);
    if (!Array.isArray(configuration)) return [];
    return configuration.filter(block => block && typeof block === 'object').map(block => ({
      title: typeof block.title === 'string' ? block.title : '',
      description: typeof block.description === 'string' ? block.description : '',
      category: typeof block.category === 'string' ? block.category : '',
      location: typeof block.location === 'string' ? block.location : '',
      weekdays: Array.isArray(block.weekdays) ? block.weekdays.filter(day => dayNames.includes(day)) : [],
      start_time: typeof block.start_time === 'string' ? block.start_time : '',
      end_time: typeof block.end_time === 'string' ? block.end_time : '',
      modality: block.modality === 'online' ? 'online' : 'onsite'
    })).filter(block => block.title && block.weekdays.length && block.start_time && block.end_time);
  }

  function parseTime(value) {
    return window.APP_UTILS?.timeStringToMinutes(value) ?? null;
  }

  function appendBlock({ day, startTime, endTime, title, description, category, location, modality = 'onsite' }, bgColor, fontColor) {
    const startMinutes = parseTime(startTime);
    const endMinutes = parseTime(endTime);
    const column = dayNames.indexOf(day);
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes || column < 0) return;
    if (startMinutes < dayStartMinutes) return;
    latestEventEnd = Math.max(latestEventEnd ?? dayStartMinutes, endMinutes);
    const block = document.createElement('article');
    block.className = 'event-block';
    block.dataset.modality = modality;
    block.dataset.day = day;
    block.setAttribute('aria-label', [title || 'Untitled event', day, category, location,
      modality === 'online' ? 'online' : 'onsite', `${startTime} to ${endTime}`].filter(Boolean).join(', '));
    block.style.top = `${startMinutes - dayStartMinutes}px`;
    block.style.height = `${endMinutes - startMinutes}px`;
    block.style.left = `${column * (100 / dayNames.length)}%`;
    block.style.width = `${100 / dayNames.length}%`;
    block.style.backgroundColor = bgColor;
    block.style.color = fontColor;
    const modalityLabel = document.createElement('span');
    modalityLabel.className = 'event-modality-label';
    modalityLabel.textContent = modality === 'online' ? 'ONLINE' : 'ONSITE';
    block.appendChild(modalityLabel);
    if (!hideDay.checked) {
      const dayElement = document.createElement('span');
      dayElement.className = 'event-day-label';
      dayElement.textContent = day;
      block.appendChild(dayElement);
    }
    if (!hideTitle.checked) {
      const titleElement = document.createElement('div');
      titleElement.className = 'subject-name';
      titleElement.textContent = title || 'Untitled block';
      block.appendChild(titleElement);
    }
    if (!hideDetails.checked && description) {
      const descriptionElement = document.createElement('div');
      descriptionElement.className = 'prof-name';
      descriptionElement.textContent = description;
      block.appendChild(descriptionElement);
    }
    if (!hideCategory.checked && category) {
      const categoryElement = document.createElement('span');
      categoryElement.className = 'event-category';
      categoryElement.textContent = category;
      block.appendChild(categoryElement);
    }
    if (!hideLocation.checked && location) {
      const locationElement = document.createElement('span');
      locationElement.className = 'event-location';
      locationElement.textContent = location;
      block.appendChild(locationElement);
    }
    if (!hideTime.checked) {
      const timeElement = document.createElement('div');
      timeElement.className = 'time-text';
      timeElement.textContent = `${startTime} - ${endTime}`;
      block.appendChild(timeElement);
    }
    blocks.appendChild(block);
  }

  function formatHour(minutes) {
    const hour = Math.floor(minutes / 60) % 24;
    return `${hour % 12 || 12} ${hour >= 12 ? 'PM' : 'AM'}`;
  }

  function renderTimeline() {
    const endMinutes = latestEventEnd === null ? dayStartMinutes + 60 : latestEventEnd + 60;
    const duration = endMinutes - dayStartMinutes;
    dayGrid.style.height = `${duration}px`;
    timeLabels.replaceChildren();

    for (let minute = dayStartMinutes; minute < endMinutes; minute += 60) {
      const label = document.createElement('div');
      label.className = 'time-cell';
      label.style.height = `${Math.min(60, endMinutes - minute)}px`;
      label.textContent = formatHour(minute);
      timeLabels.appendChild(label);
    }
  }

  function plotLegacyEvent(event, bgColor, fontColor) {
    const start = new Date(event.start_at);
    const end = new Date(event.end_at);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
    appendBlock({
      day: dayNames[start.getDay() === 0 ? 6 : start.getDay() - 1],
      startTime: start.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
      endTime: end.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
      title: event.title,
      description: event.description,
      category: event.category,
      location: event.location,
      modality: event.modality === 'online' ? 'online' : 'onsite'
    }, bgColor, fontColor);
  }

  function plotSchedule(schedule, bgColor, fontColor) {
    const configuration = weeklyBlocks(schedule);
    configuration.forEach(block => block.weekdays.forEach(day => appendBlock({
        day,
        startTime: block.start_time,
        endTime: block.end_time,
        title: block.title,
        description: block.description,
        category: block.category,
        location: block.location,
        modality: block.modality
      }, bgColor, fontColor)));
    const events = Array.isArray(schedule.events) ? schedule.events : [];
    events.forEach(event => plotLegacyEvent(event, bgColor, fontColor));
    return configuration.length + events.length;
  }

  function renderSelectedSchedule(showEmptyMessage = false) {
    if (!selectedSchedule) return;
    blocks.innerHTML = '';
    latestEventEnd = null;
    document.getElementById('capture-area')?.classList.add('visible');
    saveButton.classList.add('visible');
    const count = plotSchedule(selectedSchedule, colorInput.value || '#ffffff', fontColorInput.value || '#000000');
    renderTimeline();
    if (!count && showEmptyMessage) alert('This schedule has no weekly blocks.');
  }

  generateButton.addEventListener('click', () => {
    if (!selectedSchedule) { alert('Select a schedule first.'); return; }
    renderSelectedSchedule(true);
  });

  [hideDetails, hideCategory, hideTitle, hideTime, hideDay, hideLocation].forEach(input => {
    input.addEventListener('change', () => renderSelectedSchedule());
  });
  [colorInput, fontColorInput].forEach(input => {
    input.addEventListener('input', () => renderSelectedSchedule());
  });

  saveButton.addEventListener('click', async () => {
    if (typeof html2canvas === 'undefined') { alert('html2canvas library is not loaded.'); return; }
    const image = await html2canvas(document.getElementById('capture-area'), { backgroundColor: null, scale: 2 });
    const link = document.createElement('a');
    link.href = image.toDataURL('image/png');
    link.download = 'schedula-schedule.png';
    link.click();
  });

  try { await loadSchedules(); } catch (error) {
    list.setAttribute('aria-busy', 'false');
    const item = document.createElement('div');
    item.className = 'plotter-schedule-item';
    const message = document.createElement('span');
    message.textContent = error.message;
    item.appendChild(message);
    list.replaceChildren(item);
  }
});
