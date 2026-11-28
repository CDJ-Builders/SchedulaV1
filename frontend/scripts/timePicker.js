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
        <div class="time-picker-columns">
          <div class="time-picker-column">
            <button class="time-picker-step" type="button" data-step="hour" data-direction="1" aria-label="Add one hour">+</button>
            <label class="time-picker-select-label"><span class="sr-only">Hour</span><select class="time-picker-hour" aria-label="Hour"></select></label>
            <button class="time-picker-step" type="button" data-step="hour" data-direction="-1" aria-label="Subtract one hour">−</button>
          </div>
          <span class="time-picker-colon" aria-hidden="true">:</span>
          <div class="time-picker-column">
            <button class="time-picker-step" type="button" data-step="minute" data-direction="1" aria-label="Add 15 minutes">+</button>
            <div class="time-picker-minute-wheel" role="listbox" aria-label="Minute" tabindex="0"></div>
            <button class="time-picker-step" type="button" data-step="minute" data-direction="-1" aria-label="Subtract 15 minutes">−</button>
          </div>
        </div>
        <div class="time-picker-period" role="radiogroup" aria-label="AM or PM">
          <button type="button" role="radio" data-period="AM" aria-checked="true">AM</button>
          <button type="button" role="radio" data-period="PM" aria-checked="false">PM</button>
        </div>
        <button class="time-picker-save" type="button">Save</button>
      </div>`;

    const trigger = wrap.querySelector('.time-picker-trigger');
    const display = wrap.querySelector('.time-picker-value');
    const popover = wrap.querySelector('.time-picker-popover');
    popover.classList.add('time-picker-popover--floating');
    const hour = wrap.querySelector('.time-picker-hour');
    const minuteWheel = wrap.querySelector('.time-picker-minute-wheel');
    const minuteOptions = [];
    const periodButtons = [...wrap.querySelectorAll('[data-period]')];
    const labels = [...(input.labels || [])];
    const fieldName = input.getAttribute('aria-label') || labels[0]?.querySelector('span')?.textContent.trim() || labels[0]?.textContent.trim() || 'Time';
    trigger.setAttribute('aria-label', `Choose ${fieldName.toLowerCase()}`);
    const supportsPopover = typeof popover.showPopover === 'function';
    (supportsPopover ? document.body : (input.closest('dialog') || document.body)).append(popover);
    for (let i = 1; i <= 12; i++) hour.add(new Option(String(i), String(i)));
    for (let i = 0; i < 60; i++) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'time-picker-minute-option';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.tabIndex = -1;
      option.dataset.minute = pad(i);
      option.textContent = pad(i);
      minuteOptions.push(option);
      minuteWheel.append(option);
    }
    let selectedMinute = '00';

    function setMinute(value, scroll = true) {
      selectedMinute = pad(Number(value) % 60);
      minuteOptions.forEach(option => option.setAttribute('aria-selected', String(option.dataset.minute === selectedMinute)));
      if (scroll) minuteWheel.scrollTop = Number(selectedMinute) * 38;
    }

    function readValue() {
      const match = /^(\d{2}):(\d{2})/.exec(input.value || '');
      if (!match) return null;
      const h = Number(match[1]);
      const m = Number(match[2]);
      if (h > 23 || m > 59) return null;
      return { hour: String(h % 12 || 12), minute: pad(m), period: h >= 12 ? 'PM' : 'AM' };
    }

    function syncFromInput() {
      const value = readValue();
      display.textContent = value ? `${value.hour}:${value.minute} ${value.period}` : 'Choose a time';
      if (value) {
        hour.value = value.hour;
        setMinute(value.minute);
        periodButtons.forEach(button => button.setAttribute('aria-checked', String(button.dataset.period === value.period)));
      } else {
        setMinute('00');
      }
    }

    const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    Object.defineProperty(input, 'value', {
      configurable: true,
      get() { return valueDescriptor.get.call(this); },
      set(value) { valueDescriptor.set.call(this, value); syncFromInput(); }
    });

    function writeValue() {
      let h = Number(hour.value) % 12;
      if (wrap.querySelector('[aria-checked="true"]').dataset.period === 'PM') h += 12;
      input.value = `${pad(h)}:${selectedMinute}`;
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
      const panelWidth = Math.min(300, viewportWidth - 32);
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
        requestAnimationFrame(positionPopover);
        window.addEventListener('resize', positionPopover);
        window.addEventListener('scroll', positionPopover, true);
      } else {
        isOpen = false;
        if (supportsPopover && popover.matches(':popover-open')) popover.hidePopover();
        popover.hidden = true;
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
    hour.addEventListener('change', writeValue);
    let wheelScrollTimer;
    minuteWheel.addEventListener('scroll', () => {
      window.clearTimeout(wheelScrollTimer);
      wheelScrollTimer = window.setTimeout(() => {
        const minuteValue = Math.max(0, Math.min(59, Math.round(minuteWheel.scrollTop / 38)));
        setMinute(minuteValue, false);
        writeValue();
      }, 80);
    });
    minuteWheel.addEventListener('keydown', event => {
      const delta = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : event.key === 'PageDown' ? 5 : event.key === 'PageUp' ? -5 : 0;
      if (!delta) return;
      event.preventDefault();
      const next = (Number(selectedMinute) + delta + 60) % 60;
      setMinute(next);
      writeValue();
    });
    minuteOptions.forEach(option => option.addEventListener('click', () => {
      setMinute(option.dataset.minute);
      writeValue();
    }));
    periodButtons.forEach(button => button.addEventListener('click', () => {
      periodButtons.forEach(item => item.setAttribute('aria-checked', String(item === button)));
      writeValue();
    }));
    wrap.querySelectorAll('.time-picker-step').forEach(button => button.addEventListener('click', () => {
      const current = readValue();
      const selectedHour = Number(current?.hour || 12) % 12;
      const isPm = current?.period === 'PM' || (!current && wrap.querySelector('[aria-checked="true"]').dataset.period === 'PM');
      const totalMinutes = ((selectedHour + (isPm ? 12 : 0)) * 60) + Number(current?.minute || selectedMinute);
      const next = (totalMinutes + Number(button.dataset.direction) * (button.dataset.step === 'minute' ? 15 : 60) + 1440) % 1440;
      const nextHour = Math.floor(next / 60);
      hour.value = String(nextHour % 12 || 12);
      setMinute(next % 60);
      periodButtons.forEach(item => item.setAttribute('aria-checked', String(item.dataset.period === (nextHour >= 12 ? 'PM' : 'AM'))));
      writeValue();
    }));
    wrap.querySelector('.time-picker-save').addEventListener('click', () => { setOpen(false); trigger.focus(); });
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

  function init() { document.querySelectorAll('input[type="time"]').forEach(initTimePicker); }
  window.initSchedulaTimePickers = init;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
