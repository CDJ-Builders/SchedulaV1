const token = () => localStorage.getItem('token');
const getElement = id => document.getElementById(id);

let currentStep = 0;
const totalSteps = 5;

async function api(url, options = {}) {
  const response = await fetch(`${window.APP_CONFIG.API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token()}`,
      ...(options.headers || {})
    }
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(data.error || 'Setup failed');
  return data;
}

function showStep(step) {
  currentStep = Math.max(0, Math.min(totalSteps - 1, step));
  document.querySelectorAll('[data-setup-slide]').forEach(slide => {
    slide.classList.toggle('active', Number(slide.dataset.setupSlide) === currentStep);
  });
  document.querySelectorAll('[data-step-dot]').forEach(dot => {
    dot.classList.toggle('active', Number(dot.dataset.stepDot) <= currentStep);
  });

  getElement('setup-back-btn').disabled = currentStep === 0;
  getElement('setup-back-btn').setAttribute('aria-hidden', currentStep === 0 ? 'true' : 'false');
  getElement('setup-back-btn').style.visibility = currentStep === 0 ? 'hidden' : 'visible';

  const nextButton = getElement('setup-next-btn');
  const isFinalStep = currentStep === totalSteps - 1;
  nextButton.querySelector('span').textContent = isFinalStep ? 'Save & finish' : 'Next';
  nextButton.classList.toggle('setup-final-save', isFinalStep);
  nextButton.classList.toggle('setup-next-btn', !isFinalStep);
  const icon = nextButton.querySelector('#setup-next-icon');
  if (icon) {
    icon.innerHTML = isFinalStep
      ? '<path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6"/>'
      : '<path d="M5 12h14M12 5l7 7-7 7"/>';
  }
  nextButton.setAttribute('aria-label', currentStep === totalSteps - 1 ? 'Save and finish setup' : 'Next setup step');
}

function validateCurrentStep() {
  if (currentStep === 0) {
    if (!getElement('display-name').value.trim()) {
      throw new Error('Please enter a display name.');
    }
  }

  if (currentStep === 1) {
    const commute = getElement('setup-commute-time').value.trim();
    const backToBack = getElement('setup-max-back-to-back').value.trim();
    if (!/^\d+$/.test(commute) || !/^\d+$/.test(backToBack)) {
      throw new Error('Please enter a whole number.');
    }
  }

  if (currentStep === 4 && window.APP_PREFERENCES) {
    const root = getElement('main-content');
    const values = window.APP_PREFERENCES.serialize(root, false);
    const overlapError = window.APP_PREFERENCES.validate(values);
    if (overlapError) throw new Error(overlapError);
  }
}

async function loadSetup() {
  if (!token()) {
    window.location.href = 'login.html';
    return;
  }

  try {
    const cached = localStorage.getItem('user');
    if (cached) {
      const user = JSON.parse(cached);
      getElement('display-name').value = user.name || user.display_name || '';
    }
    const session = await api('/user-session');
    getElement('display-name').value = session.name || session.display_name || session.email || '';
  } catch (error) {
    if (typeof window.noticePopup === 'function') {
      window.noticePopup(error.message, 'Unable to load profile');
    }
  }

  const preferenceRoot = getElement('main-content');
  if (preferenceRoot && window.APP_PREFERENCES) {
    await window.APP_PREFERENCES.load(preferenceRoot);
  }
  showStep(0);
}

async function finishSetup() {
  const displayName = getElement('display-name').value.trim();
  await api('/user/profile', {
    method: 'PUT',
    body: JSON.stringify({ display_name: displayName })
  });

  await window.APP_PREFERENCES.save(getElement('main-content'));

  const session = await api('/user-session');
  localStorage.setItem('user', JSON.stringify(session));
}

async function importOnboardingSchedule(importedEvents) {
  const title = 'Imported schedule';
  const created = await api('/schedules', {
    method: 'POST',
    body: JSON.stringify({ title, schedule_type: 'weekly' })
  });

  try {
    await api(`/schedules/${created.id}`, {
      method: 'PUT',
      body: JSON.stringify({ title, schedule_type: 'weekly', configuration: importedEvents })
    });
  } catch (error) {
    try {
      await api(`/schedules/${created.id}`, { method: 'DELETE' });
    } catch (cleanupError) {
      throw new Error(`${error.message} The empty schedule could not be cleaned up: ${cleanupError.message}`);
    }
    throw error;
  }
}

function continueToHome() {
  window.location.href = './home.html';
}

getElement('setup-back-btn').addEventListener('click', () => showStep(currentStep - 1));
getElement('setup-next-btn').addEventListener('click', async () => {
  try {
    validateCurrentStep();
  } catch (error) {
    if (typeof window.noticePopup === 'function') {
      window.noticePopup(error.message, 'Check setup');
    }
    return;
  }

  if (currentStep < totalSteps - 1) {
    showStep(currentStep + 1);
    return;
  }

  const nextButton = getElement('setup-next-btn');
  nextButton.disabled = true;
  nextButton.querySelector('span').textContent = 'Saving...';
  try {
    await finishSetup();
    if (window.SchedulaScheduleExcel) {
      window.SchedulaScheduleExcel.open({
        showSkip: true,
        onImport: importOnboardingSchedule,
        onClose: continueToHome
      });
    } else {
      continueToHome();
    }
  } catch (error) {
    if (typeof window.noticePopup === 'function') {
      window.noticePopup(error.message, 'Unable to complete setup');
    }
  } finally {
    nextButton.disabled = false;
    nextButton.querySelector('span').textContent = 'Save & finish';
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadSetup);
} else {
  loadSetup();
}
