(function () {
  const TIME_RANGES = [
    { label: '7-8 AM', pref: 'pref_time_0708', avoid: 'avoid_time_0708' },
    { label: '8-10 AM', pref: 'pref_time_0810', avoid: 'avoid_time_0810' },
    { label: '10 AM-12 PM', pref: 'pref_time_1012', avoid: 'avoid_time_1012' },
    { label: '12-2 PM', pref: 'pref_time_1214', avoid: 'avoid_time_1214' },
    { label: '2-4 PM', pref: 'pref_time_1416', avoid: 'avoid_time_1416' },
    { label: '4-6 PM', pref: 'pref_time_1618', avoid: 'avoid_time_1618' },
    { label: '6-8 PM', pref: 'pref_time_1820', avoid: 'avoid_time_1820' },
    { label: '8-10 PM', pref: 'pref_time_2022', avoid: 'avoid_time_2022' },
    { label: '10 PM-12 AM', pref: 'pref_time_2224', avoid: 'avoid_time_2224' }
  ];

  const DAYS = [
    { label: 'Mon', pref: 'PrefMon', avoid: 'AvoidMon' },
    { label: 'Tue', pref: 'PrefTue', avoid: 'AvoidTue' },
    { label: 'Wed', pref: 'PrefWed', avoid: 'AvoidWed' },
    { label: 'Thurs', pref: 'PrefThurs', avoid: 'AvoidThurs' },
    { label: 'Fri', pref: 'PrefFri', avoid: 'AvoidFri' },
    { label: 'Sat', pref: 'PrefSat', avoid: 'AvoidSat' }
  ];

  const defaults = {
    max_back_to_back: 0,
    commute_time: 0,
    preferred_break_minutes: 60,
    preferred_modality: 'no preference'
  };
  TIME_RANGES.forEach(range => {
    defaults[range.pref] = false;
    defaults[range.avoid] = false;
  });
  DAYS.forEach(day => {
    defaults[day.pref] = false;
    defaults[day.avoid] = false;
  });

  function getColumnElements(root) {
    return root.querySelectorAll('[data-pref-column]');
  }

  function getPreferenceRadios(root) {
    const localRadios = [...root.querySelectorAll('input[type="radio"]')];
    return localRadios.length ? localRadios : [...document.querySelectorAll('input[type="radio"]')];
  }

  function isWholeNumber(value) {
    return /^\d+$/.test(String(value).trim());
  }

  function loadedInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
    const raw = String(value ?? '').trim();
    const number = Number(raw);
    return raw !== '' && Number.isSafeInteger(number) && number >= 0 && number <= maximum
      ? number
      : fallback;
  }

  function backToBackCacheKeys() {
    const keys = [];
    try {
      const user = JSON.parse(localStorage.getItem('user') || 'null');
      const identity = user?.user_id ?? user?.id ?? user?.email;
      if (identity) keys.push(`schedula.preferences.backToBack:${String(identity).toLowerCase()}`);
    } catch { /* Use the session token fallback below. */ }
    const token = localStorage.getItem('token');
    if (token) {
      let hash = 2166136261;
      for (let index = 0; index < token.length; index += 1) {
        hash ^= token.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      keys.push(`schedula.preferences.backToBack:session:${(hash >>> 0).toString(36)}`);
    }
    return [...new Set(keys)];
  }

  function getCachedBackToBack() {
    let latest = null;
    for (const key of backToBackCacheKeys()) {
      try {
        const cached = JSON.parse(localStorage.getItem(key) || 'null');
        if (!cached || Date.now() - cached.savedAt > 30 * 24 * 60 * 60 * 1000) {
          localStorage.removeItem(key);
          continue;
        }
        if (!latest || cached.savedAt > latest.savedAt) latest = cached;
      } catch {
        continue;
      }
    }
    return latest ? loadedInteger(latest.value, null, 6) : null;
  }

  function validate(values) {
    for (const key of ['max_back_to_back', 'commute_time']) {
      const raw = String(values[key] ?? '').trim();
      if (!isWholeNumber(raw)) {
        return 'Please enter a whole number.';
      }
      const number = Number(raw);
      if (!Number.isSafeInteger(number) || number < 0) {
        return 'Please enter a whole number.';
      }
    }
    if (Number(values.max_back_to_back) > 6) {
      return 'Back-to-back tolerance must be between 0 and 6.';
    }

    const preferredBreak = String(values.preferred_break_minutes ?? '').trim();
    if (!isWholeNumber(preferredBreak) || !Number.isSafeInteger(Number(preferredBreak)) || Number(preferredBreak) > 1440) {
      return 'Preferred break must be a whole number from 0 to 1440 minutes.';
    }

    if (!['onsite', 'online', 'no preference'].includes(values.preferred_modality)) {
      return 'Please choose a valid preferred modality.';
    }

    for (const range of TIME_RANGES) {
      if (values[range.pref] && values[range.avoid]) {
        return `The ${range.label} time range cannot be both preferred and avoided.`;
      }
    }
    for (const day of DAYS) {
      if (values[day.pref] && values[day.avoid]) {
        return `${day.label} cannot be both preferred and avoided.`;
      }
    }
    return null;
  }

  function serialize(root, convertIntegers = true) {
    const values = {};
    getColumnElements(root).forEach(element => {
      const key = element.dataset.prefColumn;
      if (element.type === 'checkbox') {
        values[key] = element.checked;
      } else if (element.type === 'radio') {
        if (element.checked) values[key] = element.value;
      } else if (element.tagName === 'SELECT') {
        values[key] = element.value;
      } else if (element.type === 'number') {
        const rawValue = String(element.value).trim();
        values[key] = rawValue === '' ? String(defaults[key]) : rawValue;
      } else {
        values[key] = element.value;
      }
    });

    getPreferenceRadios(root).filter(element => element.checked).forEach(element => {
      const key = element.dataset.prefColumn || (element.name.toLowerCase().includes('back-to-back') || element.name === 'max_back_to_back' ? 'max_back_to_back' : '');
      if (key) values[key] = Number(element.value);
    });
    const trackedTolerance = loadedInteger(root.dataset.maxBackToBack, null, 6);
    if (trackedTolerance !== null) values.max_back_to_back = trackedTolerance;
    if (!Object.prototype.hasOwnProperty.call(values, 'max_back_to_back')) {
      values.max_back_to_back = defaults.max_back_to_back;
    }

    if (convertIntegers) {
      values.max_back_to_back = Number(values.max_back_to_back);
      values.commute_time = Number(values.commute_time);
      values.preferred_break_minutes = Number(values.preferred_break_minutes);
    }
    return values;
  }

  async function load(root) {
    let data = { ...defaults };
    try {
      const response = await fetch(`${window.APP_CONFIG.API_BASE}/preferences`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Unable to load preferences');
      data = { ...defaults, ...(await response.json()) };
    } catch (error) {
      if (typeof window.noticePopup === 'function') {
        window.noticePopup(error.message, 'Unable to load');
      }
    }

    const savedTolerance = getCachedBackToBack();
    const serverTolerance = loadedInteger(data.max_back_to_back, defaults.max_back_to_back, 6);
    if (serverTolerance === 0 && savedTolerance !== null && savedTolerance > 0) {
      data.max_back_to_back = savedTolerance;
    }

    getColumnElements(root).forEach(element => {
      const key = element.dataset.prefColumn;
      if (element.type === 'checkbox') {
        element.checked = Boolean(data[key]);
      } else if (element.type === 'radio') {
        // Radio groups are hydrated as a group below so exactly one option
        // remains selected after the server value has been normalized.
      } else if (element.type === 'number') {
        const maximum = key === 'preferred_break_minutes' ? 1440 : Number.MAX_SAFE_INTEGER;
        element.value = String(loadedInteger(data[key], defaults[key], maximum));
      } else {
        element.value = data[key] ?? defaults[key];
      }
    });

    const tolerance = loadedInteger(data.max_back_to_back, defaults.max_back_to_back, 6);
    root.dataset.maxBackToBack = String(tolerance);
    const toleranceRadios = getPreferenceRadios(root);
    let matchedTolerance = false;
    toleranceRadios.forEach(element => {
      const selected = Number(element.value) === tolerance;
      element.checked = selected;
      matchedTolerance = matchedTolerance || selected;
    });
    if (!matchedTolerance && toleranceRadios.length) toleranceRadios[0].checked = true;
    if (!root.dataset.backToBackListenerBound) {
      root.addEventListener('change', event => {
        const radio = event.target.closest?.('input[type="radio"]');
        if (radio) root.dataset.maxBackToBack = radio.value;
      });
      root.dataset.backToBackListenerBound = 'true';
    }
  }

  async function save(root, overrides = {}) {
    const rawValues = serialize(root, false);
    const selectedTolerance = getPreferenceRadios(root).find(radio => radio.checked);
    if (selectedTolerance) rawValues.max_back_to_back = selectedTolerance.value;
    if (overrides.max_back_to_back !== undefined) {
      rawValues.max_back_to_back = String(overrides.max_back_to_back);
    }
    const validationError = validate(rawValues);
    if (validationError) throw new Error(validationError);

    const values = {
      ...rawValues,
      max_back_to_back: Number(rawValues.max_back_to_back),
      commute_time: Number(rawValues.commute_time),
      preferred_break_minutes: Number(rawValues.preferred_break_minutes)
    };

    const response = await fetch(`${window.APP_CONFIG.API_BASE}/preferences`, {
      method: 'PUT',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(values)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to save preferences');
    if (Number(data.max_back_to_back) !== values.max_back_to_back) {
      throw new Error('The saved back-to-back tolerance did not match your selection. Please try again.');
    }
    const cachedTolerance = JSON.stringify({
        value: values.max_back_to_back,
        savedAt: Date.now()
      });
    backToBackCacheKeys().forEach(cacheKey => localStorage.setItem(cacheKey, cachedTolerance));
    return data;
  }

  window.APP_PREFERENCES = {
    TIME_RANGES,
    DAYS,
    defaults,
    validate,
    serialize,
    load,
    save
  };
})();
