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

    root.querySelectorAll('input[type="radio"][data-pref-column]:checked').forEach(element => {
      values[element.dataset.prefColumn] = Number(element.value);
    });
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
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Unable to load preferences');
      data = { ...defaults, ...(await response.json()) };
    } catch (error) {
      if (typeof window.noticePopup === 'function') {
        window.noticePopup(error.message, 'Unable to load');
      }
    }

    getColumnElements(root).forEach(element => {
      const key = element.dataset.prefColumn;
      if (element.type === 'checkbox') {
        element.checked = Boolean(data[key]);
      } else if (element.type === 'radio') {
        const value = loadedInteger(data[key], defaults[key], 6);
        element.checked = value === Number(element.value);
      } else if (element.type === 'number') {
        const maximum = key === 'preferred_break_minutes' ? 1440 : Number.MAX_SAFE_INTEGER;
        element.value = String(loadedInteger(data[key], defaults[key], maximum));
      } else {
        element.value = data[key] ?? defaults[key];
      }
    });
  }

  async function save(root) {
    const rawValues = serialize(root, false);
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
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(values)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to save preferences');
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
