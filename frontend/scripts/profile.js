/** Generic profile, preference, and availability controls. */

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

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function setAvailabilityMessage(text, isError = false) {
  const target = getElement('availability-list');
  if (!target) return;

  target.dataset.message = text;
  target.classList.toggle('text-error-center', isError);
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
  const data = await api('/preferences');
  getElement('preference-modality').value = data.modality_preference || '';
  getElement('preference-buffer').value = data.buffer_minutes ?? 15;
  getElement('preference-view').value = data.default_view || '';
}

async function loadAvailability() {
  const blocks = await api('/availability');
  const list = getElement('availability-list');
  list.innerHTML = '';

  blocks.forEach(block => {
    const row = document.createElement('div');
    row.className = 'profile-info-row-col';

    const label = `${block.availability_type}: ${formatDate(block.start_at)} - ${formatDate(block.end_at)}${block.label ? ` | ${window.APP_UTILS.escapeHtml(block.label)}` : ''}`;
    row.innerHTML = `
      <span>${label}</span>
      <button class="btn-remove" type="button" data-availability-id="${block.id}">
        <img src="../assets/delete.png" alt="" class="btn-icon">
        Remove
      </button>
    `;
    list.appendChild(row);
  });
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
  try {
    await api('/preferences', {
      method: 'PUT',
      body: JSON.stringify({
        modality_preference: getElement('preference-modality').value || null,
        buffer_minutes: Number(getElement('preference-buffer').value) || 0,
        default_view: getElement('preference-view').value.trim() || null
      })
    });

    alert('Preferences saved.');
  } catch (error) {
    alert(error.message);
  }
});

getElement('add-availability-btn').addEventListener('click', async () => {
  const start = getElement('availability-start').value;
  const end = getElement('availability-end').value;

  if (!start || !end || new Date(end) <= new Date(start)) {
    setAvailabilityMessage('Enter a valid availability range.', true);
    return;
  }

  try {
    await api('/availability', {
      method: 'POST',
      body: JSON.stringify({
        start_at: new Date(start).toISOString(),
        end_at: new Date(end).toISOString(),
        timezone: 'UTC',
        availability_type: getElement('availability-type').value,
        label: getElement('availability-label').value.trim() || null
      })
    });

    getElement('availability-label').value = '';
    await loadAvailability();
  } catch (error) {
    setAvailabilityMessage(error.message, true);
  }
});

getElement('availability-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-availability-id]');
  if (!button) return;

  try {
    await api(`/availability/${button.dataset.availabilityId}`, {
      method: 'DELETE'
    });
    await loadAvailability();
  } catch (error) {
    setAvailabilityMessage(error.message, true);
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
  if (!getToken()) {
    window.location.href = 'login.html';
    return;
  }

  try {
    await loadProfile();
  } catch (error) {
    setAvailabilityMessage(error.message, true);
  }

  await Promise.allSettled([
    loadPreferences(),
    loadAvailability()
  ]);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeProfilePage);
} else {
  initializeProfilePage();
}
