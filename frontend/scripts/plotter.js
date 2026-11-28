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
  const hideDetails = document.getElementById('hide-prof');
  const hideTitle = document.getElementById('hide-name');
  const hideTime = document.getElementById('hide-time');
  const hideDay = document.getElementById('hide-day');
  const colorInput = document.getElementById('custom-color');
  const fontColorInput = document.getElementById('custom-font-color');
  const gradientInput = document.getElementById('block-gradient');
  const fontGradientInput = document.getElementById('font-gradient');
  const canvasBackgroundInput = document.getElementById('canvas-background-color');
  const canvasGradientInput = document.getElementById('canvas-gradient');
  const fontFamilyInput = document.getElementById('block-font-family');
  const colorHexInput = document.getElementById('color-hex-display');
  const fontColorHexInput = document.getElementById('font-color-hex-display');
  const canvasBackgroundHexInput = document.getElementById('canvas-background-hex');
  const colorSwatches = [...document.querySelectorAll('.color-swatch')];
  const timeLabels = document.getElementById('plotter-time-labels');
  const dayGrid = document.querySelector('.day-columns-grid');
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const colorPalettes = {
    color: [
      ['#FFFFFF', 'White'], ['#D9C2EC', 'Lavender'], ['#A7D8F0', 'Sky blue'], ['#A9D6B2', 'Sage'], ['#FFE08A', 'Sunshine'],
      ['#F5B6C8', 'Rose'], ['#F2B88F', 'Peach'], ['#B5C9A9', 'Mint'], ['#B8C1D9', 'Periwinkle']
    ],
    fontColor: [
      ['#2A1245', 'Plum'], ['#FFFFFF', 'White'], ['#202124', 'Charcoal'], ['#315B39', 'Forest'], ['#1E40AF', 'Blue'],
      ['#9A3412', 'Rust'], ['#751F2C', 'Burgundy'], ['#51445F', 'Mauve'], ['#5F6368', 'Slate']
    ],
    background: [
      ['#B596C8', 'Lavender'], ['#D9C2EC', 'Pale lavender'], ['#A7D8F0', 'Sky blue'], ['#A9D6B2', 'Sage'], ['#FFE08A', 'Sunshine'],
      ['#F5B6C8', 'Rose'], ['#F2B88F', 'Peach'], ['#B5C9A9', 'Mint'], ['#B8C1D9', 'Periwinkle']
    ]
  };
  try {
    const savedBackground = JSON.parse(localStorage.getItem('plotter-canvas-background') || '{}');
    if (/^#[\da-f]{6}$/i.test(savedBackground.color || '')) canvasBackgroundInput.value = savedBackground.color;
    canvasGradientInput.checked = Boolean(savedBackground.gradient);
  } catch { /* Use the default canvas appearance if stored settings are unavailable. */ }
  const defaultDayStartMinutes = 7 * 60;
  let dayStartMinutes = defaultDayStartMinutes;
  let schedules = [];
  let selectedSchedule = null;
  let latestEventEnd = null;
  let selectedBlockIds = new Set();
  let editSnapshot = null;
  let saveTimer = null;
  let fitResizeTimer = null;
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
      id: typeof block.id === 'string' && block.id ? block.id : makeId(),
      title: typeof block.title === 'string' ? block.title : '',
      description: typeof block.description === 'string' ? block.description : '',
      notes: typeof block.notes === 'string' ? block.notes : '',
      weekdays: Array.isArray(block.weekdays) ? block.weekdays.filter(day => dayNames.includes(day)) : [],
      start_time: typeof block.start_time === 'string' ? block.start_time : '',
      end_time: typeof block.end_time === 'string' ? block.end_time : '',
      modality: block.modality === 'online' ? 'online' : 'onsite',
      overrides: block.overrides && typeof block.overrides === 'object' && !Array.isArray(block.overrides) ? { ...block.overrides } : {}
    })).filter(block => block.weekdays.length && block.start_time && block.end_time);
  }

  function batchDefaults() { return { color: colorInput.value || '#ffffff', fontColor: fontColorInput.value || '#2a1245', gradient: gradientInput.checked, fontGradient: fontGradientInput.checked, fontFamily: fontFamilyInput.value || 'system' }; }
  function fontFamilyCss(name) {
    return ({
      system: 'system-ui, sans-serif', arial: 'Arial, sans-serif', georgia: 'Georgia, serif',
      verdana: 'Verdana, sans-serif', trebuchet: '"Trebuchet MS", sans-serif'
    })[name] || 'system-ui, sans-serif';
  }

  function blendColor(hex, target, amount) {
    const sourceChannels = hex.slice(1).match(/.{2}/g).map(channel => parseInt(channel, 16));
    const targetChannels = target.slice(1).match(/.{2}/g).map(channel => parseInt(channel, 16));
    return `#${sourceChannels.map((channel, index) => Math.round(channel + (targetChannels[index] - channel) * amount).toString(16).padStart(2, '0')).join('')}`;
  }
  function colorGradient(hex) {
    const highlight = blendColor(hex, '#FFFFFF', .28);
    const shade = blendColor(hex, '#000000', .14);
    return `linear-gradient(135deg, ${highlight} 0%, ${hex} 48%, ${shade} 100%)`;
  }
  function applyCanvasBackground(save = false) {
    const color = canvasBackgroundInput.value;
    const gradient = canvasGradientInput.checked;
    const gridImages = [
      'linear-gradient(to bottom, rgba(98, 41, 138, .22) 1px, transparent 1px)',
      'linear-gradient(to bottom, rgba(98, 41, 138, .08) 1px, transparent 1px)'
    ];
    const gridSizes = ['100% var(--row)', '100% calc(var(--row) / 2)'];
    if (gradient) { gridImages.push(colorGradient(color)); gridSizes.push('100% 100%'); }
    dayGrid.style.backgroundColor = color;
    document.querySelectorAll('.day-col').forEach(column => {
      column.style.backgroundColor = color;
      column.style.backgroundImage = gridImages.join(',');
      column.style.backgroundSize = gridSizes.join(',');
    });
    if (save) {
      try { localStorage.setItem('plotter-canvas-background', JSON.stringify({ color, gradient })); }
      catch { /* Keep the current canvas styling for this session if storage is unavailable. */ }
    }
  }
  function setBlockPaint(element, style) {
    element.style.backgroundColor = style.color;
    element.style.backgroundImage = style.gradient && colorValid(style.color)
      ? colorGradient(style.color)
      : 'none';
  }
  function setBlockTextPaint(element, style) {
    element.style.color = style.fontColor;
    element.style.fontFamily = fontFamilyCss(style.fontFamily);
    const children = [...element.children];
    children.forEach(child => { child.style.color = style.fontColor; child.style.fontFamily = fontFamilyCss(style.fontFamily); });
    if (!style.fontGradient) return;
    const gradient = colorGradient(style.fontColor);
    children.forEach(child => {
      child.style.color = 'transparent';
      child.style.backgroundImage = gradient;
      child.style.backgroundClip = 'text';
      child.style.webkitBackgroundClip = 'text';
      child.style.webkitTextFillColor = 'transparent';
    });
  }
  function syncColorControls() {
    colorHexInput.value = colorInput.value.toUpperCase();
    fontColorHexInput.value = fontColorInput.value.toUpperCase();
    canvasBackgroundHexInput.value = canvasBackgroundInput.value.toUpperCase();
    colorSwatches.forEach(swatch => {
      swatch.title = swatch.getAttribute('aria-label') || '';
      const target = swatch.closest('[data-color-target]')?.dataset.colorTarget;
      const currentInput = target === 'fontColor' ? fontColorInput : (target === 'background' ? canvasBackgroundInput : colorInput);
      const selected = swatch.dataset.color.toLowerCase() === currentInput.value.toLowerCase();
      swatch.classList.toggle('is-selected', selected);
      swatch.setAttribute('aria-pressed', String(selected));
    });
  }

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
    const { day, startTime, endTime, title, description, notes, modality = 'onsite', blockId, legacy = false } = item;
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
    setBlockPaint(block, style); block.style.fontFamily = fontFamilyCss(style.fontFamily);
    if (!legacy) {
      block.tabIndex = 0; block.setAttribute('role', 'group'); block.classList.toggle('is-block-selected', selectedBlockIds.has(blockId));
      block.dataset.blockId = blockId;
      const selectCheckbox = document.createElement('input'); selectCheckbox.type = 'checkbox'; selectCheckbox.className = 'block-selection-checkbox';
      selectCheckbox.checked = selectedBlockIds.has(blockId); selectCheckbox.setAttribute('aria-label', `Select ${style.title || title || 'untitled block'}`);
      selectCheckbox.addEventListener('click', event => event.stopPropagation());
      selectCheckbox.addEventListener('keydown', event => event.stopPropagation());
      selectCheckbox.addEventListener('change', () => toggleBlockSelection(blockId, selectCheckbox.checked));
      block.appendChild(selectCheckbox);
      block.addEventListener('click', event => { if (event.target !== selectCheckbox) selectBlock(blockId); });
      block.addEventListener('keydown', event => {
        if (event.target === block && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectBlock(blockId); }
      });
    }
    const modalityLabel = document.createElement('span'); modalityLabel.className = 'event-modality-label'; modalityLabel.textContent = modality === 'online' ? 'ONLINE' : 'ONSITE'; block.appendChild(modalityLabel);
    if (!hideDay.checked) { const el = document.createElement('span'); el.className = 'event-day-label'; el.textContent = day; block.appendChild(el); }
    if (!hideTitle.checked) { const el = document.createElement('div'); el.className = 'subject-name'; el.textContent = style.title || 'Untitled block'; block.appendChild(el); }
    const detailText = style.notes || style.description || description;
    if (!hideDetails.checked && detailText) { const el = document.createElement('div'); el.className = 'prof-name'; el.textContent = detailText; block.appendChild(el); }
    if (!hideTime.checked) { const el = document.createElement('div'); el.className = 'time-text'; el.textContent = `${startTime} - ${endTime}`; block.appendChild(el); }
    setBlockTextPaint(block, style);
    const fullDetails = [style.title || title || 'Untitled event', detailText, day, `${startTime} to ${endTime}`].filter(Boolean).join('\n');
    block.setAttribute('aria-label', fullDetails.replace(/\n/g, ', '));
    block.title = fullDetails;
    blocks.appendChild(block);
    fitBlockText(block);
  }

  function fitBlockText(block) {
    block.querySelector('.block-overflow-indicator')?.remove();
    block.classList.remove('has-overflowing-content');
    const overflowing = () => block.scrollHeight > block.clientHeight + 1;
    let scale = 1;
    block.style.setProperty('--block-font-scale', String(scale));
    if (!overflowing()) return;
    while (scale > .58 && overflowing()) {
      scale = Math.max(.58, +(scale - .04).toFixed(2));
      block.style.setProperty('--block-font-scale', String(scale));
    }
    if (!overflowing()) return;
    const indicator = document.createElement('span');
    indicator.className = 'block-overflow-indicator';
    indicator.textContent = 'More';
    indicator.title = 'Select this block to read all details in the editor.';
    indicator.setAttribute('aria-hidden', 'true');
    block.appendChild(indicator);
    block.classList.add('has-overflowing-content');
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
    dayStartMinutes = Model.getTimelineStartMinutes(configuration, events, defaultDayStartMinutes);
    layoutDayOccurrences(configuration, events).forEach(item => appendBlock({
      ...item.block, blockId: item.block.id, legacy: item.legacy, day: item.day,
      startTime: item.block.start_time || new Date(item.block.start_at).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
      endTime: item.block.end_time || new Date(item.block.end_at).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
      title: item.block.title, description: item.block.description, notes: item.block.notes,
      modality: item.block.modality
    }, item));
    return configuration.length + events.length;
  }

  function renderSelectedSchedule() {
    if (!selectedSchedule) return;
    blocks.replaceChildren(); latestEventEnd = null;
    document.getElementById('capture-area').classList.add('visible'); exportButton.parentElement.classList.add('visible');
    plotSchedule(selectedSchedule); renderTimeline();
    if (document.fonts?.ready) document.fonts.ready.then(() => blocks.querySelectorAll('.event-block').forEach(fitBlockText));
  }

  function selectBlock(id) {
    selectedBlockIds = new Set([id]);
    renderEditor(); renderSelectedSchedule(); setActiveTab('block');
  }
  function toggleBlockSelection(id, selected) {
    if (selected) selectedBlockIds.add(id);
    else selectedBlockIds.delete(id);
    renderEditor(); renderSelectedSchedule(); setActiveTab('block');
  }

  function currentSelectedBlocks() { return (selectedSchedule?.configuration || []).filter(block => selectedBlockIds.has(block.id)); }
  function askToReset(message) {
    return new Promise(resolve => {
      let settled = false;
      const finish = confirmed => { if (settled) return; settled = true; resolve(confirmed); };
      if (typeof window.confirmPopup !== 'function') { finish(window.confirm(message)); return; }
      window.confirmPopup(message, () => finish(true), () => finish(false), 'Reset block customizations?', 'warning');
    });
  }
  function createEditorColorPicker(key, labelText, value, gradientValue = false) {
    const wrapper = document.createElement('fieldset'); wrapper.className = 'color-picker-group block-edit-color-picker';
    wrapper.dataset.colorTarget = key;
    const legend = document.createElement('legend'); legend.textContent = labelText; wrapper.appendChild(legend);
    const swatches = document.createElement('div'); swatches.className = 'color-swatches'; swatches.setAttribute('role', 'group'); swatches.setAttribute('aria-label', `${labelText} presets`);
    colorPalettes[key].forEach(([color, name]) => {
      const swatch = document.createElement('button'); swatch.type = 'button'; swatch.className = 'color-swatch';
      swatch.dataset.color = color; swatch.style.setProperty('--swatch-color', color); swatch.setAttribute('aria-label', name);
      swatch.title = name;
      swatch.setAttribute('aria-pressed', String(color.toLowerCase() === value.toLowerCase()));
      if (color.toLowerCase() === value.toLowerCase()) swatch.classList.add('is-selected');
      swatch.addEventListener('click', () => setEditorColor(key, color, wrapper));
      swatches.appendChild(swatch);
    });
    wrapper.appendChild(swatches);
    const gradientKey = key === 'color' ? 'gradient' : 'fontGradient';
    const gradientLabel = document.createElement('label'); gradientLabel.className = 'gradient-toggle';
    const gradientToggle = document.createElement('input'); gradientToggle.type = 'checkbox'; gradientToggle.checked = gradientValue;
    gradientToggle.setAttribute('aria-label', `Use gradient for ${labelText.toLowerCase()}`);
    gradientToggle.addEventListener('change', () => {
      selectedBlockIds.forEach(id => { selectedSchedule.configuration = Model.setBlockOverride(selectedSchedule.configuration, id, { [gradientKey]: gradientToggle.checked }, batchDefaults()); });
      syncResetButtonState();
      renderSelectedSchedule(); persistConfiguration();
    });
    const gradientText = document.createElement('span'); gradientText.textContent = 'Use gradient'; gradientLabel.append(gradientToggle, gradientText); wrapper.appendChild(gradientLabel);
    const row = document.createElement('div'); row.className = 'custom-color-row';
    const pickerId = `block-${key}-picker`;
    const customLabel = document.createElement('label'); customLabel.htmlFor = pickerId; customLabel.textContent = 'Custom color';
    const picker = document.createElement('input'); picker.id = pickerId; picker.type = 'color'; picker.value = colorValid(value) ? value : '#ffffff'; picker.setAttribute('aria-label', `Choose custom ${labelText.toLowerCase()}`);
    const hexId = `block-${key}-hex`;
    const hexLabel = document.createElement('label'); hexLabel.className = 'hex-field-label'; hexLabel.htmlFor = hexId; hexLabel.textContent = 'Hex';
    const hex = document.createElement('input'); hex.id = hexId; hex.type = 'text'; hex.className = 'hex-input'; hex.value = picker.value.toUpperCase(); hex.readOnly = true; hex.setAttribute('aria-label', `Current ${labelText.toLowerCase()} hex code`);
    picker.addEventListener('input', () => { hex.value = picker.value.toUpperCase(); setEditorColor(key, picker.value, wrapper); });
    picker.addEventListener('blur', persistConfiguration);
    row.append(customLabel, picker, hexLabel, hex); wrapper.appendChild(row);
    return wrapper;
  }
  function setEditorColor(key, value, wrapper) {
    selectedBlockIds.forEach(id => { selectedSchedule.configuration = Model.setBlockOverride(selectedSchedule.configuration, id, { [key]: value }, batchDefaults()); });
    syncResetButtonState();
    wrapper.querySelectorAll('.color-swatch').forEach(swatch => {
      const selected = swatch.dataset.color.toLowerCase() === value.toLowerCase();
      swatch.classList.toggle('is-selected', selected); swatch.setAttribute('aria-pressed', String(selected));
    });
    renderSelectedSchedule();
    persistConfiguration();
  }

  function renderEditor() {
    const selected = currentSelectedBlocks();
    editor.hidden = !selected.length; blockEmptyHint.hidden = Boolean(selected.length);
    if (!selected.length) return;
    editorFields.replaceChildren();
    const style = Model.resolveBlockStyle(selected[0], batchDefaults());
    const controls = [['title', 'Title', style.title], ['description', 'Details', style.description]];
    controls.forEach(([key, labelText, value]) => {
      const wrapper = document.createElement('div'); wrapper.className = `block-edit-field${key === 'description' ? ' block-edit-details' : ''}`;
      const label = document.createElement('label'); label.textContent = labelText;
      const input = document.createElement(key === 'description' ? 'textarea' : 'input'); if (key !== 'description') input.type = 'text'; input.value = value;
      input.maxLength = key === 'title' ? 160 : 240; input.setAttribute('aria-label', labelText);
      input.disabled = selected.length > 1;
      if (input.disabled) input.title = 'Select one block to edit its title or details.';
      if (selected.some(block => Object.hasOwn(block.overrides || {}, key))) wrapper.classList.add('is-overridden');
      let before = input.value;
      input.addEventListener('focus', () => { before = input.value; editSnapshot = selected.map(block => ({ ...block, overrides: { ...(block.overrides || {}) } })); });
      input.addEventListener('input', () => {
      updateSelectedOverride(key, input.value); renderSelectedSchedule(); wrapper.classList.add('is-overridden');
      });
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter' && key !== 'description') { event.preventDefault(); input.blur(); }
        if (event.key === 'Enter' && key === 'description' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); input.blur(); }
        if (event.key === 'Escape') { event.preventDefault(); restoreEditSnapshot(); input.value = before; input.blur(); }
      });
      input.addEventListener('blur', persistConfiguration);
      wrapper.append(label, input);
      editorFields.appendChild(wrapper);
    });
    const fontWrapper = document.createElement('div'); fontWrapper.className = 'block-edit-field block-edit-font-field';
    const fontLabel = document.createElement('label'); fontLabel.textContent = 'Block font'; fontWrapper.appendChild(fontLabel);
    const fontSelect = document.createElement('select'); fontSelect.className = 'plotter-font-select';
    [['system', 'System UI (Default)'], ['arial', 'Arial'], ['georgia', 'Georgia'], ['verdana', 'Verdana'], ['trebuchet', 'Trebuchet MS']].forEach(([value, label]) => { const option = document.createElement('option'); option.value = value; option.textContent = label; fontSelect.appendChild(option); });
    fontSelect.value = style.fontFamily || 'system'; fontSelect.addEventListener('change', () => { updateSelectedOverride('fontFamily', fontSelect.value); renderSelectedSchedule(); persistConfiguration(); });
    fontWrapper.appendChild(fontSelect);
    editorFields.appendChild(fontWrapper);
    editorFields.appendChild(createEditorColorPicker('color', 'Block color', style.color, style.gradient));
    editorFields.appendChild(createEditorColorPicker('fontColor', 'Font color', style.fontColor, style.fontGradient));
    const resetAll = document.createElement('button'); resetAll.type = 'button'; resetAll.className = 'key danger reset-block-button'; resetAll.textContent = 'Reset Selected Blocks';
    resetAll.disabled = !hasBlockCustomizations(selected);
    resetAll.addEventListener('click', async event => {
      event.preventDefault(); event.stopPropagation();
      if (event.target !== event.currentTarget || resetAll.disabled || resetAll.dataset.resetPending === 'true') return;
      resetAll.dataset.resetPending = 'true';
      resetAll.disabled = true;
      const schedule = selectedSchedule;
      const ids = selected.map(block => block.id);
      const confirmed = await askToReset(`Reset all customizations on the ${ids.length === 1 ? 'selected block' : 'selected blocks'}?`);
      if (!confirmed || selectedSchedule !== schedule) {
        resetAll.dataset.resetPending = 'false';
        resetAll.disabled = !hasBlockCustomizations(selected);
        return;
      }
      ids.forEach(id => { schedule.configuration = Model.clearBlockOverride(schedule.configuration, id); });
      renderEditor(); renderSelectedSchedule(); persistConfiguration('The selected block customizations were reset.');
    });
    editorFields.appendChild(resetAll);
    editorStatus.textContent = selected.length > 1
      ? `${selected.length} blocks selected. Title and details are locked while multiple blocks are selected.`
      : 'Changes preview as you type. Press Enter or leave a field to save.';
  }

  function updateSelectedOverride(key, value) {
    if (key === 'title' && value.length > 120) return;
    if (key === 'description' && value.length > 240) return;
    selectedBlockIds.forEach(id => { selectedSchedule.configuration = Model.setBlockOverride(selectedSchedule.configuration, id, { [key]: value }, batchDefaults()); });
    syncResetButtonState();
  }
  function hasBlockCustomizations(blocks) { return blocks.some(block => Object.keys(block.overrides || {}).length > 0); }
  function syncResetButtonState() {
    const resetButton = editorFields.querySelector('.reset-block-button');
    if (resetButton && resetButton.dataset.resetPending !== 'true') resetButton.disabled = !hasBlockCustomizations(currentSelectedBlocks());
  }
  function restoreEditSnapshot() {
    if (!editSnapshot || !selectedSchedule) return;
    const previous = new Map(editSnapshot.map(block => [block.id, block]));
    selectedSchedule.configuration = selectedSchedule.configuration.map(block => previous.get(block.id) || block); editSnapshot = null; renderSelectedSchedule();
  }

  async function persistConfiguration(successMessage = '') {
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
        if (selectedSchedule?.id === target.id) {
          editorStatus.textContent = 'Changes saved.'; editorStatus.classList.remove('is-error'); editSnapshot = null;
        }
        if (successMessage && typeof window.successPopup === 'function') window.successPopup(successMessage, 'Blocks reset');
      } catch (error) { if (selectedSchedule?.id === target.id) { editorStatus.textContent = error.message; editorStatus.classList.add('is-error'); } }
    }, 250);
  }

  function applyBatchChange(input, key) {
    const isGradient = key === 'gradient' || key === 'fontGradient';
    const isColor = key === 'color' || key === 'fontColor';
    const value = isGradient ? input.checked : input.value;
    if (isColor && !colorValid(value)) { input.setCustomValidity('Enter a valid hex color.'); input.reportValidity(); return; }
    if (isColor) input.setCustomValidity('');
    if (selectedSchedule) {
      selectedSchedule.configuration = selectedSchedule.configuration.map(block => ({
        ...block,
        overrides: { ...(block.overrides || {}), [key]: value }
      }));
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
    head.appendChild(title); view.appendChild(head);
    const grid = document.createElement('div'); grid.className = 'export-grid';
    const headerRow = document.createElement('div'); headerRow.className = 'export-head-row';
    const blank = document.createElement('div'); blank.className = 'export-time-head'; headerRow.appendChild(blank);
    dayNames.forEach(day => { const cell = document.createElement('div'); cell.className = 'export-day-head'; cell.textContent = day; headerRow.appendChild(cell); }); grid.appendChild(headerRow);
    const body = document.createElement('div'); body.className = 'export-grid-body';
    const times = document.createElement('div'); times.className = 'export-times';
    for (let minute = dayStartMinutes; minute < endMinute; minute += 60) { const label = document.createElement('div'); label.textContent = formatHour(minute); times.appendChild(label); }
    body.appendChild(times);
    const canvasColor = canvasBackgroundInput.value;
    const canvasGradient = canvasGradientInput.checked ? colorGradient(canvasColor) : 'none';
    const columns = dayNames.map(() => {
      const col = document.createElement('div'); col.className = 'export-day-column';
      col.style.setProperty('--canvas-background', canvasColor);
      col.style.setProperty('--canvas-gradient', canvasGradient);
      body.appendChild(col); return col;
    });
    const duration = endMinute - dayStartMinutes;
    exportItems.forEach(item => {
      const resolvedStyle = item.legacy
        ? { ...batchDefaults(), title: item.block.title || '', description: item.block.description || '', notes: item.block.notes || '' }
        : Model.resolveBlockStyle(item.block, batchDefaults());
      const style = resolvedStyle;
      const card = document.createElement('article'); card.className = 'export-block';
      card.dataset.modality = item.block.modality || 'onsite';
      card.style.top = `${((item.start - dayStartMinutes) / duration) * 100}%`; card.style.height = `${((item.end - item.start) / duration) * 100}%`;
      card.style.left = `${(item.lane / item.laneCount) * 100}%`; card.style.width = `${100 / item.laneCount}%`;
      setBlockPaint(card, style); card.style.fontFamily = fontFamilyCss(style.fontFamily);
      if (!hideDay.checked) { const dayLabel = document.createElement('span'); dayLabel.className = 'export-day'; dayLabel.textContent = item.day; card.appendChild(dayLabel); }
      if (!hideTitle.checked) { const name = document.createElement('strong'); name.className = 'export-title'; name.textContent = style.title || 'Untitled block'; card.appendChild(name); }
      const detail = style.notes || style.description || item.block.description;
      if (!hideDetails.checked && detail) { const note = document.createElement('span'); note.className = 'export-detail'; note.textContent = detail; card.appendChild(note); }
      const metadata = item.block.modality === 'online' ? 'Online' : 'Onsite';
      if (metadata) { const meta = document.createElement('span'); meta.className = 'export-meta'; meta.textContent = metadata; card.appendChild(meta); }
      if (!hideTime.checked) {
        const time = document.createElement('small'); time.className = 'export-time'; time.textContent = item.legacy
          ? `${new Date(item.block.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–${new Date(item.block.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : `${item.block.start_time}–${item.block.end_time}`; card.appendChild(time);
      }
      setBlockTextPaint(card, style);
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
    return `
      .schedule-export-view{box-sizing:border-box;width:1280px;padding:40px;background:#fff;color:#2a1245;font-family:"Bricolage Grotesque",system-ui,sans-serif}
      .schedule-export-view *{box-sizing:border-box}
      .export-header{display:block;margin-bottom:22px;padding:22px 26px;border:2px solid #2a1245;border-radius:18px;background:#fff!important;box-shadow:inset 0 1px 0 #fff,inset 0 -3px 0 rgba(98,41,138,.12),0 4px 0 #62298a,0 8px 14px rgba(42,18,69,.14)}
      .schedule-export-view .export-header h1{display:block;width:auto;margin:0;color:#2a1245;background:transparent!important;padding:0;font-size:32px;font-weight:800;line-height:1.08;letter-spacing:-.025em;overflow-wrap:anywhere}
      .export-grid{width:100%;overflow:hidden;border:2px solid #2a1245;border-radius:16px;background:#fff;box-shadow:inset 0 1px 0 #fff,0 4px 0 #62298a,0 9px 18px rgba(42,18,69,.16)}
      .export-head-row,.export-grid-body{display:grid;grid-template-columns:84px repeat(7,minmax(0,1fr))}
      .export-head-row{background:#d9c2ec}
      .export-day-head,.export-time-head{min-height:48px;border-right:1px solid rgba(42,18,69,.18);border-bottom:1px solid rgba(42,18,69,.24)}
      .export-day-head{display:flex;align-items:center;justify-content:center;padding:10px 5px;color:#2a1245;font-size:13px;font-weight:800;line-height:1.2;text-align:center;text-transform:uppercase;letter-spacing:.05em;text-shadow:0 1px 0 rgba(255,255,255,.65)}
      .export-time-head{background:#d9c2ec}
      .export-grid-body{position:relative}
      .export-times{display:flex;flex-direction:column;background:#fbf8fd}
      .export-times div{display:flex;align-items:flex-start;justify-content:flex-end;height:66px;padding:7px 9px 0 3px;border-right:1px solid rgba(42,18,69,.18);border-bottom:1px solid rgba(98,41,138,.12);color:#4a1d6d;font-size:11px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.2;white-space:nowrap}
      .export-day-column{position:relative;border-left:1px solid rgba(255,255,255,.65);background-color:var(--canvas-background,#fff)}
      .export-block{position:absolute;display:flex;flex-direction:column;align-items:flex-start;overflow:hidden;border:2px solid currentColor;border-radius:8px;padding:7px 8px;font-size:11px;line-height:1.2}
      .export-block strong,.export-block span,.export-block small{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .export-block .export-day{margin:0 0 3px;font-size:8px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
      .export-block .export-title,.export-block .export-detail{white-space:normal;overflow-wrap:anywhere}
      .export-block .export-title{margin-bottom:3px;font-weight:700}
      .export-block .export-detail{margin-bottom:3px;font-style:italic;opacity:.9}
      .export-block .export-meta{position:absolute;top:3px;right:4px;z-index:1;padding:1px 4px;border:1px solid currentColor;border-radius:4px;font-size:7px;font-weight:900;line-height:1.2}
      .export-block[data-modality="onsite"] .export-meta{background:#ffedd5;color:#9a3412}
      .export-block[data-modality="online"] .export-meta{background:#dbeafe;color:#1e40af}
      .export-block .export-time{font-size:9px;font-weight:800;font-variant-numeric:tabular-nums}
      .export-legend{display:flex;flex-wrap:wrap;gap:12px;margin:16px 0 0;color:#5f6368;font-size:14px}
      @media print{@page{size:A4 landscape;margin:10mm}html,body{margin:0!important;padding:0!important;background:#fff!important}.schedule-export-view{width:100%;padding:0;print-color-adjust:exact;-webkit-print-color-adjust:exact}.export-header{margin-bottom:14px;padding:15px 18px}.export-header h1{font-size:22px}.export-grid-body{height:calc(190mm - 68px)!important}.export-times div{height:calc((190mm - 68px)/var(--rows))}.export-day-column{background-size:100% calc((190mm - 68px)/var(--rows))}.export-block{font-size:9px}.export-block .export-time{font-size:8px}}
    `;
  }
  function exportCanvasCss() {
    return '.export-day-column{background-color:var(--canvas-background,#fff);background-image:linear-gradient(to bottom,rgba(98,41,138,.18) 1px,transparent 1px),var(--canvas-gradient,none);background-size:100% 66px,100% 100%;background-repeat:repeat-y,no-repeat;background-position:top left,top left}';
  }

  async function withExportView(callback) {
    const host = document.createElement('div'); host.className = 'export-host';
    const style = document.createElement('style'); style.textContent = exportCss() + exportCanvasCss(); host.appendChild(style);
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

  async function exportPdf() {
    await withExportView(async view => {
      const popup = window.open('', '_blank'); if (!popup) throw new Error('Allow the print window to open, then try PDF export again.');
      const title = safeFilename(selectedSchedule.title);
      const page = 'A4 landscape';
      const printHeight = '190mm';
      const fitPage = `@media print{.export-grid-body{height:calc(${printHeight} - 68px)!important}.export-times div{height:calc((${printHeight} - 68px)/var(--rows))}.export-day-column{background-size:100% calc((${printHeight} - 68px)/var(--rows))}}`;
      popup.document.open(); popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>schedula-${title}-${localDateStamp()}</title><style>${exportCss()}${exportCanvasCss()} @page{size:${page};margin:10mm}${fitPage}.export-host{position:static!important;left:auto!important}</style></head><body>${view.outerHTML}<script>window.addEventListener('load',()=>{document.fonts.ready.then(()=>window.print())});window.addEventListener('afterprint',()=>window.close());<\/script></body></html>`); popup.document.close();
    });
  }

  function safeFilename(value) { return String(value || 'schedule').normalize('NFKD').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'schedule'; }
  function localDateStamp() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }
  function escapePopupText(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }
  function notifyExport(message, error = false) {
    const safeMessage = escapePopupText(message);
    if (error) window.alert(`Error: ${safeMessage}`, 'Export failed');
    else window.successPopup(safeMessage, 'Export ready');
  }

  async function runExport(type, button) {
    if (!selectedSchedule) { notifyExport('Select a schedule first.', true); return; }
    exportButton.disabled = true; exportButton.setAttribute('aria-busy', 'true'); exportButton.textContent = 'Preparing export…'; exportMenu.hidden = true; exportButton.setAttribute('aria-expanded', 'false');
    try { if (type === 'png') await exportPng(); else await exportPdf(); notifyExport(type === 'png' ? 'PNG export is ready.' : 'Print dialog opened for PDF export. Choose Save as PDF.'); }
    catch (error) { notifyExport(error.message || 'Export failed. Please try again.', true); }
    finally { exportButton.disabled = false; exportButton.removeAttribute('aria-busy'); exportButton.innerHTML = 'Export <span aria-hidden="true">▾</span>'; button?.blur(); }
  }

  generateButton.addEventListener('click', () => { if (!selectedSchedule) { notifyExport('Select a schedule first.', true); return; } renderSelectedSchedule(); });
  [hideDetails, hideTitle, hideTime, hideDay].forEach(input => input.addEventListener('change', renderSelectedSchedule));
  window.addEventListener('resize', () => {
    clearTimeout(fitResizeTimer);
    fitResizeTimer = window.setTimeout(() => blocks.querySelectorAll('.event-block').forEach(fitBlockText), 100);
  });
  colorInput.addEventListener('input', () => { syncColorControls(); applyBatchChange(colorInput, 'color'); });
  fontColorInput.addEventListener('input', () => { syncColorControls(); applyBatchChange(fontColorInput, 'fontColor'); });
  canvasBackgroundInput.addEventListener('input', () => { syncColorControls(); applyCanvasBackground(true); });
  canvasGradientInput.addEventListener('change', () => applyCanvasBackground(true));
  gradientInput.addEventListener('change', () => applyBatchChange(gradientInput, 'gradient'));
  fontGradientInput.addEventListener('change', () => applyBatchChange(fontGradientInput, 'fontGradient'));
  fontFamilyInput.addEventListener('change', () => applyBatchChange(fontFamilyInput, 'fontFamily'));
  colorSwatches.forEach(swatch => swatch.addEventListener('click', () => {
    const target = swatch.closest('[data-color-target]')?.dataset.colorTarget;
    const input = target === 'fontColor' ? fontColorInput : (target === 'background' ? canvasBackgroundInput : colorInput);
    input.value = swatch.dataset.color;
    syncColorControls();
    if (target === 'background') applyCanvasBackground(true);
    else applyBatchChange(input, target === 'fontColor' ? 'fontColor' : 'color');
  }));
  syncColorControls();
  applyCanvasBackground();
  exportButton.addEventListener('click', () => { exportMenu.hidden = !exportMenu.hidden; exportButton.setAttribute('aria-expanded', String(!exportMenu.hidden)); });
  exportMenu.addEventListener('click', event => { const button = event.target.closest('[data-export]'); if (button) runExport(button.dataset.export, button); });
  document.addEventListener('click', event => { if (!event.target.closest('.export-actions')) exportMenu.hidden = true; });

  try { await loadSchedules(); } catch (error) {
    list.setAttribute('aria-busy', 'false'); const item = document.createElement('div'); item.className = 'plotter-schedule-item'; item.textContent = error.message; list.replaceChildren(item);
  }
});
