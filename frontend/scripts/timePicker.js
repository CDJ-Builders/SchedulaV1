/* Shared 12-hour time picker for fields stored as HH:mm. */
(function () {
  const pad = value => String(value).padStart(2, '0');

  function initTimePicker(input) {
    if (input.dataset.timePickerReady) return;
    input.dataset.timePickerReady = 'true';
    const wrap = document.createElement('div');
    wrap.className = 'time-picker';
    wrap.innerHTML = `
      <button class="time-picker-trigger" type="button" aria-haspopup="dialog" aria-expanded="false">
        <span class="time-picker-value">Choose a time</span><svg class="time-picker-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <div class="time-picker-popover" popover="manual" role="dialog" aria-label="Choose time" hidden>
        <strong class="time-picker-heading">Time</strong>
        <div class="time-picker-controls">
          <div class="time-picker-column">
            <button class="time-picker-step" type="button" data-step="hour" data-direction="1" aria-label="Add one hour">+</button>
            <div class="time-picker-wheel-field">
              <button class="time-picker-wheel-toggle" type="button" aria-expanded="false" aria-controls="" aria-label="Choose hour"><span class="time-picker-hour-value">12</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button>
              <div class="time-picker-wheel time-picker-hour-wheel" role="listbox" aria-label="Hour" tabindex="0" hidden></div>
            </div>
            <button class="time-picker-step" type="button" data-step="hour" data-direction="-1" aria-label="Subtract one hour">−</button>
          </div>
          <span class="time-picker-colon" aria-hidden="true">:</span>
          <div class="time-picker-column">
            <button class="time-picker-step" type="button" data-step="minute" data-direction="1" aria-label="Add 15 minutes">+</button>
            <div class="time-picker-wheel-field">
              <button class="time-picker-wheel-toggle" type="button" aria-expanded="false" aria-controls="" aria-label="Choose minute"><span class="time-picker-minute-value">00</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button>
              <div class="time-picker-wheel time-picker-minute-wheel" role="listbox" aria-label="Minute" tabindex="0" hidden></div>
            </div>
            <button class="time-picker-step" type="button" data-step="minute" data-direction="-1" aria-label="Subtract 15 minutes">−</button>
          </div>
          <div class="time-picker-period" role="radiogroup" aria-label="AM or PM">
            <button type="button" role="radio" data-period="AM" aria-checked="true">AM</button>
            <button type="button" role="radio" data-period="PM" aria-checked="false">PM</button>
          </div>
        </div>
        <button class="time-picker-save" type="button">Save</button>
      </div>`;

    const trigger = wrap.querySelector('.time-picker-trigger');
    const display = wrap.querySelector('.time-picker-value');
    const popover = wrap.querySelector('.time-picker-popover');
    popover.classList.add('time-picker-popover--floating');
    const hourWheel = popover.querySelector('.time-picker-hour-wheel');
    const minuteWheel = popover.querySelector('.time-picker-minute-wheel');
    const hourValue = popover.querySelector('.time-picker-hour-value');
    const minuteValue = popover.querySelector('.time-picker-minute-value');
    const hourToggle = popover.querySelector('.time-picker-wheel-toggle[aria-label="Choose hour"]');
    const minuteToggle = popover.querySelector('.time-picker-wheel-toggle[aria-label="Choose minute"]');
    const pickerId = `time-picker-${Math.random().toString(36).slice(2)}`;
    hourWheel.id = `${pickerId}-hour`;
    minuteWheel.id = `${pickerId}-minute`;
    hourToggle.setAttribute('aria-controls', hourWheel.id);
    minuteToggle.setAttribute('aria-controls', minuteWheel.id);
    const periodButtons = [...popover.querySelectorAll('[data-period]')];
    const labels = [...(input.labels || [])];
    const fieldName = input.getAttribute('aria-label') || labels[0]?.querySelector('span')?.textContent.trim() || labels[0]?.textContent.trim() || 'Time';
    trigger.setAttribute('aria-label', `Choose ${fieldName.toLowerCase()}`);
    const supportsPopover = typeof popover.showPopover === 'function';
    // Keep modal-owned pickers inside their dialog. A modal makes the rest of
    // the document inert, so a body-portaled popover can appear but not receive
    // pointer or keyboard interaction while these dialogs are open.
    (input.closest('dialog') || document.body).append(popover);

    const wheelOptions = { hour: [], minute: [] };
    function addOptions(wheel, type, count, format) {
      for (let i = 0; i < count; i++) {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = `time-picker-wheel-option time-picker-${type}-option`;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', 'false');
        option.tabIndex = -1;
        option.dataset.value = String(i + (type === 'hour' ? 1 : 0));
        option.textContent = format(i);
        wheelOptions[type].push(option);
        wheel.append(option);
      }
    }
    addOptions(hourWheel, 'hour', 12, i => String(i + 1));
    addOptions(minuteWheel, 'minute', 60, pad);
    const selected = { hour: 12, minute: 0 };
    const rowHeight = 40;

    function updateWheelVisual(type) {
      const wheel = type === 'hour' ? hourWheel : minuteWheel;
      wheelOptions[type].forEach((option, index) => {
        const distance = index - wheel.scrollTop / rowHeight;
        const curve = Math.max(-68, Math.min(68, distance * 22));
        const fade = Math.max(0.28, 1 - Math.abs(distance) * 0.22);
        option.style.transform = `perspective(420px) rotateX(${curve}deg) scale(${1 - Math.min(Math.abs(distance), 3) * 0.045})`;
        option.style.opacity = String(fade);
      });
    }

    function setWheel(type, value, scroll = true) {
      const maximum = type === 'hour' ? 12 : 59;
      const normalized = type === 'hour' ? ((Number(value) - 1 + 12) % 12) + 1 : ((Number(value) % 60) + 60) % 60;
      selected[type] = normalized;
      const key = type === 'hour' ? 'hour' : 'minute';
      const valueElement = type === 'hour' ? hourValue : minuteValue;
      const wheel = type === 'hour' ? hourWheel : minuteWheel;
      valueElement.textContent = type === 'hour' ? String(normalized) : pad(normalized);
      wheelOptions[key].forEach(option => option.setAttribute('aria-selected', String(Number(option.dataset.value) === normalized)));
      if (scroll) wheel.scrollTop = (type === 'hour' ? normalized - 1 : normalized) * rowHeight;
      updateWheelVisual(type);
      return maximum;
    }

    function setWheelExpanded(type, expanded) {
      const wheel = type === 'hour' ? hourWheel : minuteWheel;
      const button = type === 'hour' ? hourToggle : minuteToggle;
      wheel.hidden = !expanded;
      button.hidden = expanded;
      button.setAttribute('aria-expanded', String(expanded));
      button.closest('.time-picker-wheel-field').classList.toggle('is-expanded', expanded);
      if (expanded) {
        setWheel(type, selected[type]);
        requestAnimationFrame(() => {
          wheel.focus({ preventScroll: true });
          updateWheelVisual(type);
        });
      }
    }

    function readValue() {
      const match = /^(\d{2}):(\d{2})/.exec(input.value || '');
      if (!match) return null;
      const h = Number(match[1]);
      const m = Number(match[2]);
      if (h > 23 || m > 59) return null;
      return { hour: h % 12 || 12, minute: m, period: h >= 12 ? 'PM' : 'AM' };
    }

    function syncFromInput() {
      const value = readValue();
      display.textContent = value ? `${value.hour}:${pad(value.minute)} ${value.period}` : 'Choose a time';
      if (value) {
        setWheel('hour', value.hour);
        setWheel('minute', value.minute);
        periodButtons.forEach(button => button.setAttribute('aria-checked', String(button.dataset.period === value.period)));
      } else {
        setWheel('hour', 12);
        setWheel('minute', 0);
      }
    }

    function writeValue() {
      let h = selected.hour % 12;
      if (popover.querySelector('[aria-checked="true"]').dataset.period === 'PM') h += 12;
      input.value = `${pad(h)}:${pad(selected.minute)}`;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      syncFromInput();
    }

    let isOpen = false;
    function positionPopover() {
      if (!isOpen) return;
      const rect = trigger.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const panelWidth = Math.min(360, viewportWidth - 32);
      const left = Math.max(16, Math.min(rect.left, viewportWidth - panelWidth - 16));
      popover.style.width = `${panelWidth}px`;
      popover.style.maxHeight = `${Math.max(180, viewportHeight - 24)}px`;
      const panelHeight = popover.offsetHeight;
      const below = viewportHeight - rect.bottom - 8;
      const above = rect.top - 8;
      let top = rect.bottom + 8;
      if (below < panelHeight && above > below) top = Math.max(12, rect.top - panelHeight - 8);
      else top = Math.min(top, viewportHeight - panelHeight - 12);
      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
    }

    function setOpen(open) {
      if (open) {
        syncFromInput();
        isOpen = true;
        popover.hidden = false;
        if (supportsPopover) popover.showPopover();
        positionPopover();
        window.addEventListener('resize', positionPopover);
        window.addEventListener('scroll', positionPopover, true);
      } else {
        isOpen = false;
        if (supportsPopover && popover.matches(':popover-open')) popover.hidePopover();
        popover.hidden = true;
        setWheelExpanded('hour', false);
        setWheelExpanded('minute', false);
        window.removeEventListener('resize', positionPopover);
        window.removeEventListener('scroll', positionPopover, true);
      }
      trigger.setAttribute('aria-expanded', String(open));
      trigger.classList.toggle('is-open', open);
    }

    trigger.addEventListener('click', () => setOpen(!isOpen));
    labels.forEach(label => label.addEventListener('click', event => {
      if (event.target === label || event.target.tagName === 'SPAN') {
        event.preventDefault();
        setOpen(true);
        trigger.focus();
      }
    }));
    hourToggle.addEventListener('click', () => setWheelExpanded('hour', hourToggle.getAttribute('aria-expanded') !== 'true'));
    minuteToggle.addEventListener('click', () => setWheelExpanded('minute', minuteToggle.getAttribute('aria-expanded') !== 'true'));

    const scrollTimers = { hour: 0, minute: 0 };
    [['hour', hourWheel], ['minute', minuteWheel]].forEach(([type, wheel]) => {
      const toggle = type === 'hour' ? hourToggle : minuteToggle;
      wheel.addEventListener('click', () => {
        setWheelExpanded(type, false);
        toggle.focus({ preventScroll: true });
      });
      wheel.addEventListener('scroll', () => {
        window.clearTimeout(scrollTimers[type]);
        scrollTimers[type] = window.setTimeout(() => {
          const max = type === 'hour' ? 11 : 59;
          const index = Math.max(0, Math.min(max, Math.round(wheel.scrollTop / rowHeight)));
          setWheel(type, type === 'hour' ? index + 1 : index, false);
          writeValue();
        }, 80);
      });
      wheel.addEventListener('scroll', () => updateWheelVisual(type), { passive: true });
      wheel.addEventListener('keydown', event => {
        const delta = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : event.key === 'PageDown' ? 5 : event.key === 'PageUp' ? -5 : 0;
        if (!delta) return;
        event.preventDefault();
        setWheel(type, selected[type] + delta);
        writeValue();
      });
      wheelOptions[type].forEach(option => option.addEventListener('click', () => {
        setWheel(type, Number(option.dataset.value));
        writeValue();
      }));
    });
    periodButtons.forEach(button => button.addEventListener('click', () => {
      periodButtons.forEach(item => item.setAttribute('aria-checked', String(item === button)));
      writeValue();
    }));
    popover.querySelectorAll('.time-picker-step').forEach(button => button.addEventListener('click', () => {
      if (button.dataset.step === 'minute') {
        const current = readValue();
        const selectedHour = Number(current?.hour || selected.hour) % 12;
        const isPm = current?.period === 'PM' || (!current && popover.querySelector('[aria-checked="true"]').dataset.period === 'PM');
        const totalMinutes = ((selectedHour + (isPm ? 12 : 0)) * 60) + Number(current?.minute ?? selected.minute);
        const next = (totalMinutes + Number(button.dataset.direction) * 15 + 1440) % 1440;
        const nextHour = Math.floor(next / 60);
        setWheel('hour', nextHour % 12 || 12);
        setWheel('minute', next % 60);
        periodButtons.forEach(item => item.setAttribute('aria-checked', String(item.dataset.period === (nextHour >= 12 ? 'PM' : 'AM'))));
      } else {
        const current = readValue();
        const hour12 = Number(current?.hour || selected.hour) % 12;
        const isPm = current?.period === 'PM' || (!current && popover.querySelector('[aria-checked="true"]').dataset.period === 'PM');
        const totalMinutes = ((hour12 + (isPm ? 12 : 0)) * 60) + Number(current?.minute ?? selected.minute);
        const next = (totalMinutes + Number(button.dataset.direction) * 60 + 1440) % 1440;
        const nextHour = Math.floor(next / 60);
        setWheel('hour', nextHour % 12 || 12);
        periodButtons.forEach(item => item.setAttribute('aria-checked', String(item.dataset.period === (nextHour >= 12 ? 'PM' : 'AM'))));
      }
      writeValue();
    }));
    popover.querySelector('.time-picker-save').addEventListener('click', () => { setOpen(false); trigger.focus(); });
    document.addEventListener('pointerdown', event => { if (!wrap.contains(event.target) && !popover.contains(event.target)) setOpen(false); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !popover.hidden) { setOpen(false); trigger.focus(); }
    });
    input.classList.add('time-picker-native');
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');
    input.insertAdjacentElement('afterend', wrap);
    input.addEventListener('change', syncFromInput);
    input.addEventListener('input', syncFromInput);
    syncFromInput();
  }

  function init() { document.querySelectorAll('input[data-time-picker]').forEach(initTimePicker); }
  window.initSchedulaTimePickers = init;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
