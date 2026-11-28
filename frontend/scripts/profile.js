/** Generic profile and preference controls. */

const getElement = id => document.getElementById(id);

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`
  };
}

async function api(url, options = {}) {
  const response = await fetch(`${window.APP_CONFIG.API_BASE}${url}`, {
    ...options,
    headers: {
      ...getHeaders(),
      ...(options.headers || {})
    }
  });

  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Request failed');
  }
  return data;
}

async function loadProfile() {
  const cachedUser = localStorage.getItem('user');
  if (cachedUser) {
    try {
      const cached = JSON.parse(cachedUser);
      const displayName = getElement('profile-display-name');
      const email = getElement('profile-email');
      if (displayName) displayName.value = cached.name || cached.display_name || '';
      if (email) email.value = cached.email || '';
    } catch {
      // Ignore malformed session cache and continue with the server response.
    }
  }

  let data = null;

  try {
    data = await api('/user-session');
  } catch (error) {
    const cachedUser = localStorage.getItem('user');
    if (cachedUser) {
      try {
        data = JSON.parse(cachedUser);
      } catch {
        data = null;
      }
    }
  }

  if (!data) throw new Error('Unable to load profile data');

  const displayName = getElement('profile-display-name');
  const email = getElement('profile-email');
  if (!displayName || !email) return;

  displayName.value = data.name || data.display_name || data.email || '';
  email.value = data.email || '';
}

window.populateProfileFromUser = function (user) {
  if (!user) return;

  const displayName = getElement('profile-display-name');
  const email = getElement('profile-email');

  if (displayName) displayName.value = user.name || user.display_name || user.email || '';
  if (email) email.value = user.email || '';
};

async function loadPreferences() {
  const root = getElement('profile-preferences');
  if (root && window.APP_PREFERENCES) {
    await window.APP_PREFERENCES.load(root);
  }
}

getElement('save-profile-btn').addEventListener('click', async () => {
  const saveButton = getElement('save-profile-btn');
  const displayName = getElement('profile-display-name').value.trim();
  const email = getElement('profile-email').value.trim();

  if (!displayName) {
    if (typeof window.noticePopup === 'function') {
      window.noticePopup('Please enter a display name.', 'Warning');
    } else {
      alert('Please enter a display name.');
    }
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (typeof window.noticePopup === 'function') {
      window.noticePopup('Invalid email format. Enter an address like name@example.com.', 'Invalid email');
    } else {
      alert('Invalid email format. Enter an address like name@example.com.');
    }
    return;
  }

  saveButton.disabled = true;
  saveButton.textContent = 'Saving...';

  try {
    await api('/user/profile', {
      method: 'PUT',
      body: JSON.stringify({
        display_name: displayName,
        email
      })
    });

    const updatedUser = await api('/user-session').catch(() => null);
    const cachedUser = localStorage.getItem('user');
    let nextUser = updatedUser;
    if (!nextUser && cachedUser) {
      try { nextUser = JSON.parse(cachedUser); } catch { nextUser = null; }
    }
    if (nextUser) {
      nextUser.name = getElement('profile-display-name').value.trim();
      nextUser.email = getElement('profile-email').value.trim();
      localStorage.setItem('user', JSON.stringify(nextUser));
    }

    if (typeof window.successPopup === 'function') {
      window.successPopup('Profile saved successfully.', 'Profile saved');
    } else {
      alert('Profile saved.');
    }
  } catch (error) {
    if (typeof window.noticePopup === 'function') {
      if (error.message.includes('already exists')) {
        window.noticePopup('This email address already exists on another account.', 'Email already exists');
      } else if (error.message.toLowerCase().includes('invalid email')) {
        window.noticePopup('Invalid email format. Enter an address like name@example.com.', 'Invalid email');
      } else {
        window.noticePopup(error.message, 'Unable to save');
      }
    } else {
      alert(error.message);
    }
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Save profile';
  }
});

getElement('save-preferences-btn').addEventListener('click', async () => {
  const root = getElement('profile-preferences');
  try {
    const profileRadios = [...root.querySelectorAll('input[type="radio"]')];
    const radioControls = profileRadios.length ? profileRadios : [...document.querySelectorAll('input[type="radio"]')];
    const selectedTolerance = radioControls.find(radio => radio.checked);
    if (!selectedTolerance) throw new Error('Select a back-to-back tolerance before saving.');
    await window.APP_PREFERENCES.save(root, {
      max_back_to_back: Number(selectedTolerance.value)
    });
    if (typeof window.successPopup === 'function') {
      window.successPopup('Preferences saved successfully.', 'Preferences saved');
    } else {
      alert('Preferences saved.');
    }
  } catch (error) {
    if (typeof window.noticePopup === 'function') {
      window.noticePopup(error.message, 'Unable to save preferences');
    } else {
      alert(error.message);
    }
  }
});

getElement('delete-account-btn').addEventListener('click', () => {
  confirmPopup(
    'Delete your account and schedules? This cannot be undone.',
    async () => {
      try {
        await api('/user/profile', { method: 'DELETE' });
        localStorage.clear();
        window.location.href = '../index.html';
      } catch (error) {
        alert(error.message);
      }
    },
    null,
    'Delete account',
    'error'
  );
});

async function initializeProfilePage() {
  initializeProfileCarousel();
  const preferenceRoot = getElement('profile-preferences');
  if (preferenceRoot && window.APP_PREFERENCES) {
    window.addEventListener('storage', event => {
      if (event.key?.startsWith('schedula.preferences.backToBack:')) {
        window.APP_PREFERENCES.load(preferenceRoot);
      }
    });
  }

  if (!getToken()) {
    window.location.href = 'login.html';
    return;
  }

  try {
    await loadProfile();
  } catch (error) {
    setAvailabilityMessage(error.message, true);
  }

  await loadPreferences();
}

function initializeProfileCarousel() {
  const carousel = getElement('profile-carousel');
  if (!carousel) return;

  const slides = [...carousel.querySelectorAll('[data-profile-slide]')];
  const backButton = getElement('profile-back-btn');
  const nextButton = getElement('profile-next-btn');
  let current = 0;

  const showPage = (index, moveFocus = false) => {
    current = Math.max(0, Math.min(index, slides.length - 1));
    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === current;
      slide.classList.toggle('active', active);
      slide.setAttribute('aria-hidden', String(!active));
      slide.inert = !active;
    });
    backButton.hidden = current === 0;
    nextButton.hidden = current === slides.length - 1;
    if (moveFocus) slides[current].querySelector('h2')?.focus({ preventScroll: true });
  };

  backButton.addEventListener('click', () => showPage(current - 1, true));
  nextButton.addEventListener('click', () => showPage(current + 1, true));
  slides.forEach(slide => slide.querySelector('h2')?.setAttribute('tabindex', '-1'));
  showPage(0);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeProfilePage);
} else {
  initializeProfilePage();
}
