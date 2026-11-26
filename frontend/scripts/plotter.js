/** Schedule Plotter with per-block overrides and dedicated export rendering. */
document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');
  if (!token) { window.location.href = 'login.html'; return; }

  const Model = window.PlotterModel;
  const list = document.getElementById('plotter-schedule-list');
  const generateButton = document.getElementById('btn-generate');
  const exportButton = document.getElementById('btn-export');
  const exportMenu = document.getElementById('export-menu');
  const blocks = document.getElementById('blocks-container');
  const editor = document.getElementById('block-editor');
  const blockTab = document.getElementById('tab-block');
  const blockEmptyHint = document.querySelector('.block-empty-hint');
  const tabs = [
    { name: 'schedule', button: document.getElementById('tab-schedule'), panel: document.getElementById('panel-schedule') },
    { name: 'options', button: document.getElementById('tab-options'), panel: document.getElementById('panel-options') },
    { name: 'block', button: blockTab, panel: document.getElementById('panel-block') }
  ];
  const editorFields = document.getElementById('block-editor-fields');
  const editorStatus = document.getElementById('block-editor-status');
  const overwriteInput = document.getElementById('overwrite-customizations');
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
  let selectedBlockIds = new Set();
  let editSnapshot = null;
  let saveTimer = null;
  let activeTab = 'schedule';

  function setActiveTab(name, focus = false) {
    const target = tabs.find(tab => tab.name === name && !tab.button.disabled);
    if (!target) return;
    activeTab = target.name;
    tabs.forEach(tab => {
      const selected = tab === target;
      tab.button.setAttribute('aria-selected', String(selected));
      tab.button.tabIndex = selected ? 0 : -1;
      tab.panel.hidden = !selected;
    });
    if (focus) target.button.focus();
  }

  tabs.forEach(tab => {
    tab.button.addEventListener('click', () => setActiveTab(tab.name));
    tab.button.addEventListener('keydown', event => {
      const enabled = tabs.filter(item => !item.button.disabled);
      const current = enabled.indexOf(tab);
      let nextIndex = null;
      if (event.key === 'ArrowRight') nextIndex = (current + 1) % enabled.length;
      if (event.key === 'ArrowLeft') nextIndex = (current - 1 + enabled.length) % enabled.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = enabled.length - 1;
      if (nextIndex !== null) { event.preventDefault(); setActiveTab(enabled[nextIndex].name, true); }
    });
  });

  const colorValid = value => /^#[\da-f]{6}$/i.test(value);
  const makeId = () => window.crypto?.randomUUID?.() || `block-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  async function loadSchedules() {
    const response = await fetch(`${window.APP_CONFIG.API_BASE}/schedules`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error('Failed to load schedules');
    schedules = await response.json();
    schedules.forEach(schedule => { schedule.configuration = normalizeBlocks(schedule.configuration); });
    renderScheduleList();
  }

  function parseJsonValue(value) {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return null; }
  }

  function normalizeBlocks(value) {
    const configuration = parseJsonValue(value);
    if (!Array.isArray(configuration)) return [];
    return configuration.filter(block => block && typeof block === 'object').map(block => ({
      ...block,
      id: typeof block.id === 'string' && block.id ? block.id : makeId(),
      title: typeof block.title === 'string' ? block.title : '',
      description: typeof block.description === 'string' ? block.description : '',
      notes: typeof block.notes === 'string' ? block.notes : '',
      category: typeof block.category === 'string' ? block.category : '',
      location: typeof block.location === 'string' ? block.location : '',
      weekdays: Array.isArray(block.weekdays) ? block.weekdays.filter(day => dayNames.includes(day)) : [],
      start_time: typeof block.start_time === 'string' ? block.start_time : '',
      end_time: typeof block.end_time === 'string' ? block.end_time : '',
      modality: block.modality === 'online' ? 'online' : 'onsite',
      overrides: block.overrides && typeof block.overrides === 'object' && !Array.isArray(block.overrides) ? { ...block.overrides } : {}
    })).filter(block => block.weekdays.length && block.start_time && block.end_time);
  }

  function batchDefaults() { return { color: colorInput.value || '#ffffff', fontColor: fontColorInput.value || '#2a1245' }; }

  function renderScheduleList() {
    list.setAttribute('aria-busy', 'false');
    list.replaceChildren();
    if (!schedules.length) {
      const empty = document.createElement('div'); empty.className = 'plotter-schedule-item'; empty.textContent = 'No schedules found.'; list.appendChild(empty); return;
    }
    schedules.forEach(schedule => {
      const item = document.createElement('div'); item.className = 'plotter-schedule-item';
      const name = document.createElement('span'); name.textContent = schedule.title;
      const button = document.createElement('button'); button.className = 'btn-select'; button.type = 'button'; button.textContent = selectedSchedule?.id === schedule.id ? 'SELECTED' : 'SELECT';
      if (selectedSchedule?.id === schedule.id) button.classList.add('selected');
      button.addEventListener('click', () => {
        selectedSchedule = schedule; selectedBlockIds.clear(); editor.hidden = true; renderEditor(); setActiveTab('schedule'); renderScheduleList();
        if (document.getElementById('capture-area').classList.contains('visible')) renderSelectedSchedule();
      });
      item.append(name, button); list.appendChild(item);
    });
  }

  function parseTime(value) { return window.APP_UTILS?.timeStringToMinutes(value) ?? null; }

  function layoutDayOccurrences(configuration, datedEvents = []) {
    return dayNames.flatMap((day, column) => {
      const entries = configuration.filter(block => block.weekdays.includes(day)).map(block => ({
        block, day, column, start: parseTime(block.start_time), end: parseTime(block.end_time)
      })).filter(item => item.start !== null && item.end > item.start && item.start >= dayStartMinutes);
      datedEvents.forEach(event => {
        const startAt = new Date(event.start_at); const endAt = new Date(event.end_at);
        if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return;
        const eventDay = dayNames[startAt.getDay() === 0 ? 6 : startAt.getDay() - 1];
        const start = startAt.getHours() * 60 + startAt.getMinutes(); const end = endAt.getHours() * 60 + endAt.getMinutes();
        if (eventDay === day && start >= dayStartMinutes && end > start) entries.push({ block: event, day, column, start, end, legacy: true });
      });
      entries.sort((a, b) => a.start - b.start || a.end - b.end);
      const lanes = [];
      entries.forEach(item => {
        let lane = lanes.findIndex(end => end <= item.start);
        if (lane < 0) lane = lanes.length;
        lanes[lane] = item.end; item.lane = lane;
      });
      entries.forEach(item => { item.laneCount = Math.max(1, lanes.length); });
      return entries;
    });
  }

  function appendBlock(item, layout = {}) {
    const { day, startTime, endTime, title, description, notes, category, location, modality = 'onsite', blockId, legacy = false } = item;
    const startMinutes = parseTime(startTime); const endMinutes = parseTime(endTime); const column = dayNames.indexOf(day);
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes || column < 0 || startMinutes < dayStartMinutes) return;
    latestEventEnd = Math.max(latestEventEnd ?? dayStartMinutes, endMinutes);
    const block = document.createElement('article'); block.className = 'event-block'; block.dataset.modality = modality; block.dataset.day = day;
    const style = legacy
      ? { ...batchDefaults(), title: item.title || '', description: item.description || '', notes: item.notes || '' }
      : Model.resolveBlockStyle(item, batchDefaults());
    block.style.top = `${startMinutes - dayStartMinutes}px`; block.style.height = `${endMinutes - startMinutes}px`;
    const laneCount = layout.laneCount || 1; const lane = layout.lane || 0; const dayWidth = 100 / dayNames.length;
    block.style.left = `${column * dayWidth + lane * dayWidth / laneCount}%`; block.style.width = `${dayWidth / laneCount}%`;
    block.style.backgroundColor = style.color; block.style.color = readableTextColor(style.color, style.fontColor);
    const overridden = !legacy && Object.keys(item.overrides || {}).length > 0;
    if (overridden) block.classList.add('has-overrides');
    if (!legacy) {
      block.tabIndex = 0; block.setAttribute('role', 'button'); block.setAttribute('aria-pressed', String(selectedBlockIds.has(blockId)));
      block.dataset.blockId = blockId;
      if (overridden) { const indicator = document.createElement('span'); indicator.className = 'override-indicator'; indicator.textContent = 'Edited'; indicator.setAttribute('aria-label', 'This block has individual changes'); block.appendChild(indicator); }
      block.addEventListener('click', event => selectBlock(blockId, event));
      block.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectBlock(blockId, event); } });
    }
    block.setAttribute('aria-label', [style.title || title || 'Untitled event', day, category, location, `${startTime} to ${endTime}`].filter(Boolean).join(', '));
    const modalityLabel = document.createElement('span'); modalityLabel.className = 'event-modality-label'; modalityLabel.textContent = modality === 'online' ? 'ONLINE' : 'ONSITE'; block.appendChild(modalityLabel);
    if (!hideDay.checked) { const el = document.createElement('span'); el.className = 'event-day-label'; el.textContent = day; block.appendChild(el); }
    if (!hideTitle.checked) { const el = document.createElement('div'); el.className = 'subject-name'; el.textContent = style.title || 'Untitled block'; block.appendChild(el); }
    const detailText = style.notes || style.description || description;
    if (!hideDetails.checked && detailText) { const el = document.createElement('div'); el.className = 'prof-name'; el.textContent = detailText; block.appendChild(el); }
    if (!hideCategory.checked && category) { const el = document.createElement('span'); el.className = 'event-category'; el.textContent = category; block.appendChild(el); }
    if (!hideLocation.checked && location) { const el = document.createElement('span'); el.className = 'event-location'; el.textContent = location; block.appendChild(el); }
    if (!hideTime.checked) { const el = document.createElement('div'); el.className = 'time-text'; el.textContent = `${startTime} - ${endTime}`; block.appendChild(el); }
    blocks.appendChild(block);
  }

  function readableTextColor(background, preferred) {
    if (!colorValid(background)) return preferred || '#000000';
    const rgb = background.slice(1).match(/.{2}/g).map(part => parseInt(part, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    const luminance = .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
    if (colorValid(preferred)) {
      const textRgb = preferred.slice(1).match(/.{2}/g).map(part => parseInt(part, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
      const textLuminance = .2126 * textRgb[0] + .7152 * textRgb[1] + .0722 * textRgb[2];
      const ratio = (Math.max(luminance, textLuminance) + .05) / (Math.min(luminance, textLuminance) + .05);
      if (ratio >= 4.5) return preferred;
    }
    return luminance > .179 ? '#000000' : '#ffffff';
  }

  function formatHour(minutes) { const hour = Math.floor(minutes / 60) % 24; return `${hour % 12 || 12} ${hour >= 12 ? 'PM' : 'AM'}`; }
  function renderTimeline() {
    const endMinutes = Math.max(dayStartMinutes + 60, Math.min(24 * 60, (latestEventEnd ?? dayStartMinutes) + 60));
    const duration = endMinutes - dayStartMinutes; dayGrid.style.height = `${duration}px`; timeLabels.replaceChildren();
    for (let minute = dayStartMinutes; minute < endMinutes; minute += 60) {
      const label = document.createElement('div'); label.className = 'time-cell'; label.style.height = `${Math.min(60, endMinutes - minute)}px`; label.textContent = formatHour(minute); timeLabels.appendChild(label);
    }
  }

  function plotSchedule(schedule) {
    const configuration = normalizeBlocks(schedule.configuration);
    const events = Array.isArray(schedule.events) ? schedule.events : [];
    layoutDayOccurrences(configuration, events).forEach(item => appendBlock({
      ...item.block, blockId: item.block.id, legacy: item.legacy, day: item.day,
      startTime: item.block.start_time || new Date(item.block.start_at).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
      endTime: item.block.end_time || new Date(item.block.end_at).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
      title: item.block.title, description: item.block.description, notes: item.block.notes,
      category: item.block.category, location: item.block.location, modality: item.block.modality
    }, item));
    return configuration.length + events.length;
  }

  function renderSelectedSchedule() {
    if (!selectedSchedule) return;
    blocks.replaceChildren(); latestEventEnd = null;
    document.getElementById('capture-area').classList.add('visible'); exportButton.parentElement.classList.add('visible');
    plotSchedule(selectedSchedule); renderTimeline();
  }

  function selectBlock(id, event) {
    const multi = event.ctrlKey || event.metaKey || event.shiftKey;
    if (!multi) selectedBlockIds = new Set([id]);
    else if (selectedBlockIds.has(id)) selectedBlockIds.delete(id); else selectedBlockIds.add(id);
    renderEditor(); renderSelectedSchedule(); setActiveTab('block');
  }

  function currentSelectedBlocks() { return (selectedSchedule?.configuration || []).filter(block => selectedBlockIds.has(block.id)); }
  function renderEditor() {
    const selected = currentSelectedBlocks();
    editor.hidden = !selected.length; blockEmptyHint.hidden = Boolean(selected.length);
    if (!selected.length) return;
    editorFields.replaceChildren();
    const style = Model.resolveBlockStyle(selected[0], batchDefaults());
    const controls = [
      ['title', 'Title', 'text', style.title], ['description', 'Details', 'text', style.description], ['notes', 'Notes', 'text', style.notes],
      ['color', 'Block color', 'color', style.color], ['fontColor', 'Text color', 'color', style.fontColor]
    ];
    controls.forEach(([key, labelText, type, value]) => {
      const wrapper = document.createElement('div'); wrapper.className = 'block-edit-field';
      const label = document.createElement('label'); label.textContent = labelText;
      const input = document.createElement('input'); input.type = type; input.value = type === 'color' && !colorValid(value) ? '#ffffff' : value;
      input.maxLength = type === 'text' ? 160 : undefined; input.setAttribute('aria-label', labelText);
      const overridden = selected.some(block => Object.hasOwn(block.overrides || {}, key));
      if (overridden) wrapper.classList.add('is-overridden');
      const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'reset-field'; reset.textContent = overridden ? 'Reset to default' : 'Using default'; reset.disabled = !overridden;
      let before = input.value;
      input.addEventListener('focus', () => { before = input.value; editSnapshot = selected.map(block => ({ ...block, overrides: { ...(block.overrides || {}) } })); });
      input.addEventListener('input', () => {
        if (type === 'color' && !colorValid(input.value)) return;
        updateSelectedOverride(key, input.value); renderSelectedSchedule(); wrapper.classList.add('is-overridden');
      });
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
        if (event.key === 'Escape') { event.preventDefault(); restoreEditSnapshot(); input.value = before; input.blur(); }
      });
      input.addEventListener('blur', persistConfiguration);
      reset.addEventListener('click', () => { selected.forEach(block => { selectedSchedule.configuration = Model.clearBlockOverride(selectedSchedule.configuration, block.id, key); }); renderEditor(); renderSelectedSchedule(); persistConfiguration(); });
      wrapper.append(label, input, reset); editorFields.appendChild(wrapper);
    });
    const resetAll = document.createElement('button'); resetAll.type = 'button'; resetAll.className = 'key'; resetAll.textContent = 'Reset all block changes';
    resetAll.addEventListener('click', () => { selected.forEach(block => { selectedSchedule.configuration = Model.clearBlockOverride(selectedSchedule.configuration, block.id); }); renderEditor(); renderSelectedSchedule(); persistConfiguration(); });
    editorFields.appendChild(resetAll);
    editorStatus.textContent = selected.length > 1 ? `${selected.length} blocks selected. Use Ctrl or Command-click to change the selection.` : 'Changes preview as you type. Press Enter or leave a field to save.';
  }

  function updateSelectedOverride(key, value) {
    if (key === 'title' && value.length > 120) return;
    if (['description', 'notes'].includes(key) && value.length > 240) return;
    selectedBlockIds.forEach(id => { selectedSchedule.configuration = Model.setBlockOverride(selectedSchedule.configuration, id, { [key]: value }, batchDefaults()); });
  }
  function restoreEditSnapshot() {
    if (!editSnapshot || !selectedSchedule) return;
    const previous = new Map(editSnapshot.map(block => [block.id, block]));
    selectedSchedule.configuration = selectedSchedule.configuration.map(block => previous.get(block.id) || block); editSnapshot = null; renderSelectedSchedule();
  }

  async function persistConfiguration() {
    const target = selectedSchedule;
    if (!target) return;
    const configuration = JSON.parse(JSON.stringify(target.configuration));
    clearTimeout(saveTimer); saveTimer = setTimeout(async () => {
      if (selectedSchedule?.id === target.id) { editorStatus.textContent = 'Saving changes…'; editorStatus.classList.remove('is-error'); }
      try {
        const response = await fetch(`${window.APP_CONFIG.API_BASE}/schedules/${encodeURIComponent(target.id)}`, {
          method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ configuration })
        });
        if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'Could not save block changes.'); }
        if (selectedSchedule?.id === target.id) { editorStatus.textContent = 'Changes saved.'; editorStatus.classList.remove('is-error'); editSnapshot = null; }
      } catch (error) { if (selectedSchedule?.id === target.id) { editorStatus.textContent = error.message; editorStatus.classList.add('is-error'); } }
    }, 250);
  }

  function applyBatchChange(input, key) {
    if (!colorValid(input.value)) { input.setCustomValidity('Enter a valid hex color.'); input.reportValidity(); return; }
    input.setCustomValidity('');
    if (selectedSchedule && overwriteInput.checked) {
      const patch = { [key]: input.value };
      const result = Model.applyBatch(selectedSchedule.configuration, batchDefaults(), patch, { skipOverridden: false });
      selectedSchedule.configuration = result.blocks;
      persistConfiguration();
    }
    renderSelectedSchedule(); if (!editor.hidden) renderEditor();
  }

  function buildExportView() {
    const schedule = selectedSchedule; const configuration = normalizeBlocks(schedule.configuration);
    const occurrences = layoutDayOccurrences(configuration);
    const exportItems = occurrences.map(item => ({ ...item, legacy: false }));
    (Array.isArray(schedule.events) ? schedule.events : []).forEach(event => {
      const startAt = new Date(event.start_at); const endAt = new Date(event.end_at);
      if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return;
      const day = dayNames[startAt.getDay() === 0 ? 6 : startAt.getDay() - 1];
      const start = startAt.getHours() * 60 + startAt.getMinutes(); const end = endAt.getHours() * 60 + endAt.getMinutes();
      if (start < dayStartMinutes || end <= start) return;
      exportItems.push({ block: event, day, column: dayNames.indexOf(day), start, end, legacy: true });
    });
    dayNames.forEach((day, column) => {
      const entries = exportItems.filter(item => item.day === day).sort((a, b) => a.start - b.start || a.end - b.end);
      const laneEnds = [];
      entries.forEach(item => { let lane = laneEnds.findIndex(end => end <= item.start); if (lane < 0) lane = laneEnds.length; laneEnds[lane] = item.end; item.lane = lane; });
      entries.forEach(item => { item.laneCount = Math.max(1, laneEnds.length); item.column = column; });
    });
    const allEnd = Math.max(dayStartMinutes + 60, ...exportItems.map(item => item.end));
    const maxEnd = allEnd;
    const endMinute = Math.min(24 * 60, Math.ceil((maxEnd + 60) / 60) * 60);
    const view = document.createElement('section'); view.className = 'schedule-export-view'; view.setAttribute('aria-label', 'Schedule export');
    const head = document.createElement('header'); head.className = 'export-header';
    const title = document.createElement('h1'); title.textContent = schedule.title || 'Schedule';
    const period = [schedule.term, schedule.week].filter(value => typeof value === 'string' && value.trim()).join(' · ') || 'Weekly schedule';
    const date = document.createElement('p'); date.textContent = `${period} · Exported ${new Date().toLocaleDateString()}`; head.append(title, date); view.appendChild(head);
    const grid = document.createElement('div'); grid.className = 'export-grid';
    const headerRow = document.createElement('div'); headerRow.className = 'export-head-row';
    const blank = document.createElement('div'); blank.className = 'export-time-head'; headerRow.appendChild(blank);
    dayNames.forEach(day => { const cell = document.createElement('div'); cell.className = 'export-day-head'; cell.textContent = day; headerRow.appendChild(cell); }); grid.appendChild(headerRow);
    const body = document.createElement('div'); body.className = 'export-grid-body';
    const times = document.createElement('div'); times.className = 'export-times';
    for (let minute = dayStartMinutes; minute < endMinute; minute += 60) { const label = document.createElement('div'); label.textContent = formatHour(minute); times.appendChild(label); }
    body.appendChild(times);
    const columns = dayNames.map(() => { const col = document.createElement('div'); col.className = 'export-day-column'; body.appendChild(col); return col; });
    const duration = endMinute - dayStartMinutes;
    exportItems.forEach(item => {
      const style = item.legacy
        ? { ...batchDefaults(), title: item.block.title || '', description: item.block.description || '', notes: item.block.notes || '' }
        : Model.resolveBlockStyle(item.block, batchDefaults());
      const card = document.createElement('article'); card.className = 'export-block';
      card.style.top = `${((item.start - dayStartMinutes) / duration) * 100}%`; card.style.height = `${((item.end - item.start) / duration) * 100}%`;
      card.style.left = `${(item.lane / item.laneCount) * 100}%`; card.style.width = `${100 / item.laneCount}%`;
      card.style.backgroundColor = style.color; card.style.color = readableTextColor(style.color, style.fontColor);
      const name = document.createElement('strong'); name.textContent = style.title || 'Untitled block'; card.appendChild(name);
      const detail = style.notes || style.description || item.block.description;
      if (detail) { const note = document.createElement('span'); note.textContent = detail; card.appendChild(note); }
      const metadata = [item.block.category, item.block.location, item.block.modality === 'online' ? 'Online' : 'Onsite'].filter(Boolean).join(' · ');
      if (metadata) { const meta = document.createElement('span'); meta.className = 'export-meta'; meta.textContent = metadata; card.appendChild(meta); }
      const time = document.createElement('small'); time.textContent = item.legacy
        ? `${new Date(item.block.start_at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}–${new Date(item.block.end_at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}`
        : `${item.block.start_time}–${item.block.end_time}`; card.appendChild(time);
      columns[item.column].appendChild(card);
    });
    const rowCount = duration / 60;
    body.style.height = `${rowCount * 66}px`; body.style.setProperty('--rows', String(rowCount)); grid.appendChild(body); view.appendChild(grid);
    const customColors = [...new Set(configuration.map(block => block.overrides?.color).filter(color => colorValid(color)).map(color => color.toLowerCase()))];
    if (customColors.length) {
      const legend = document.createElement('div'); legend.className = 'export-legend';
      customColors.forEach(color => { const item = document.createElement('span'); item.className = 'export-legend-item'; const swatch = document.createElement('i'); swatch.style.backgroundColor = color; item.append(swatch, document.createTextNode(color.toUpperCase())); legend.appendChild(item); });
      view.appendChild(legend);
    }
    return view;
  }

  function exportCss() {
    return `.schedule-export-view{box-sizing:border-box;width:1280px;padding:40px;background:#fff;color:#202124;font-family:Arial,sans-serif}.schedule-export-view *{box-sizing:border-box}.export-header{margin-bottom:24px}.export-header h1{margin:0 0 6px;font-size:30px}.export-header p,.export-legend{margin:0;color:#5f6368;font-size:14px}.export-grid{width:100%;border:1px solid #d5d9df;background:#fff}.export-head-row,.export-grid-body{display:grid;grid-template-columns:84px repeat(7,minmax(0,1fr))}.export-day-head{padding:12px 4px;text-align:center;font-size:13px;font-weight:700;border-left:1px solid #d5d9df;border-bottom:1px solid #d5d9df}.export-time-head{border-bottom:1px solid #d5d9df}.export-grid-body{position:relative}.export-times{display:flex;flex-direction:column}.export-times div{height:66px;padding:4px 8px 0 0;text-align:right;font-size:11px;color:#59616d;border-bottom:1px solid #e3e6eb}.export-day-column{position:relative;border-left:1px solid #d5d9df;background:repeating-linear-gradient(to bottom,#fff 0,#fff 65px,#e3e6eb 65px,#e3e6eb 66px)}.export-block{position:absolute;overflow:hidden;border:1px solid currentColor;border-radius:4px;padding:5px 6px;font-size:11px;line-height:1.25}.export-block strong,.export-block span,.export-block small{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.export-block small{margin-top:3px;font-size:10px}.export-legend{margin-top:16px}@media print{@page{size:A4 landscape;margin:10mm}html,body{margin:0!important;padding:0!important;background:#fff!important}.schedule-export-view{width:100%;padding:0;print-color-adjust:exact;-webkit-print-color-adjust:exact}.export-header{margin-bottom:12px}.export-header h1{font-size:22px}.export-grid-body{height:calc(190mm - 68px)!important}.export-times div{height:calc((190mm - 68px)/var(--rows))}.export-day-column{background-size:100% calc((190mm - 68px)/var(--rows))}.export-block{font-size:9px}.export-block small{font-size:8px}}`;
  }

  async function withExportView(callback) {
    const host = document.createElement('div'); host.className = 'export-host';
    const style = document.createElement('style'); style.textContent = exportCss(); host.appendChild(style);
    const view = buildExportView(); host.appendChild(view); document.body.appendChild(host);
    try { if (document.fonts?.ready) await document.fonts.ready; await callback(view); }
    finally { host.remove(); }
  }

  async function exportPng() {
    if (typeof html2canvas === 'undefined') throw new Error('PNG export is unavailable because the capture library did not load.');
    await withExportView(async view => {
      const image = await html2canvas(view, {
        backgroundColor: '#ffffff', scale: 2, width: 1280, windowWidth: 1280, windowHeight: view.scrollHeight,
        scrollX: 0, scrollY: 0, useCORS: true,
        onclone: clonedDocument => {
          const cloneHost = clonedDocument.querySelector('.export-host');
          if (cloneHost) { cloneHost.style.position = 'fixed'; cloneHost.style.left = '0'; cloneHost.style.top = '0'; cloneHost.style.transform = 'none'; cloneHost.style.zIndex = '10000'; }
        }
      });
      const link = document.createElement('a'); link.href = image.toDataURL('image/png'); link.download = `schedula-${safeFilename(selectedSchedule.title)}-${localDateStamp()}.png`; link.click();
    });
  }

  async function exportPdf(orientation) {
    await withExportView(async view => {
      const popup = window.open('', '_blank'); if (!popup) throw new Error('Allow the print window to open, then try PDF export again.');
      const title = safeFilename(selectedSchedule.title);
      const page = orientation === 'portrait' ? 'A4 portrait' : 'A4 landscape';
      const printHeight = orientation === 'portrait' ? '277mm' : '190mm';
      const fitPage = `@media print{.export-grid-body{height:calc(${printHeight} - 68px)!important}.export-times div{height:calc((${printHeight} - 68px)/var(--rows))}.export-day-column{background-size:100% calc((${printHeight} - 68px)/var(--rows))}}`;
      popup.document.open(); popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>schedula-${title}-${localDateStamp()}</title><style>${exportCss()} @page{size:${page};margin:10mm}${fitPage}.export-host{position:static!important;left:auto!important}</style></head><body>${view.outerHTML}<script>window.addEventListener('load',()=>{document.fonts.ready.then(()=>window.print())});window.addEventListener('afterprint',()=>window.close());<\/script></body></html>`); popup.document.close();
    });
  }

  function safeFilename(value) { return String(value || 'schedule').normalize('NFKD').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'schedule'; }
  function localDateStamp() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }
  function notifyExport(message, error = false) { const toast = document.getElementById('export-status'); toast.textContent = message; toast.classList.toggle('is-error', error); toast.hidden = false; window.setTimeout(() => { toast.hidden = true; }, 5000); }

  async function runExport(type, button) {
    if (!selectedSchedule) { notifyExport('Select a schedule first.', true); return; }
    exportButton.disabled = true; exportButton.setAttribute('aria-busy', 'true'); exportButton.textContent = 'Preparing export…'; exportMenu.hidden = true; exportButton.setAttribute('aria-expanded', 'false');
    try { if (type === 'png') await exportPng(); else await exportPdf(type.endsWith('portrait') ? 'portrait' : 'landscape'); notifyExport(type === 'png' ? 'PNG export is ready.' : 'Print dialog opened for PDF export. Choose Save as PDF.'); }
    catch (error) { notifyExport(error.message || 'Export failed. Please try again.', true); }
    finally { exportButton.disabled = false; exportButton.removeAttribute('aria-busy'); exportButton.innerHTML = 'Export <span aria-hidden="true">▾</span>'; button?.blur(); }
  }

  generateButton.addEventListener('click', () => { if (!selectedSchedule) { notifyExport('Select a schedule first.', true); return; } renderSelectedSchedule(); });
  [hideDetails, hideCategory, hideTitle, hideTime, hideDay, hideLocation].forEach(input => input.addEventListener('change', renderSelectedSchedule));
  colorInput.addEventListener('input', () => applyBatchChange(colorInput, 'color'));
  fontColorInput.addEventListener('input', () => applyBatchChange(fontColorInput, 'fontColor'));
  exportButton.addEventListener('click', () => { exportMenu.hidden = !exportMenu.hidden; exportButton.setAttribute('aria-expanded', String(!exportMenu.hidden)); });
  exportMenu.addEventListener('click', event => { const button = event.target.closest('[data-export]'); if (button) runExport(button.dataset.export === 'pdf-landscape' || button.dataset.export === 'pdf-portrait' ? button.dataset.export : button.dataset.export, button); });
  document.addEventListener('click', event => { if (!event.target.closest('.export-actions')) exportMenu.hidden = true; });

  try { await loadSchedules(); } catch (error) {
    list.setAttribute('aria-busy', 'false'); const item = document.createElement('div'); item.className = 'plotter-schedule-item'; item.textContent = error.message; list.replaceChildren(item);
  }
});
