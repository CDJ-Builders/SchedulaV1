(() => {
  const byId = id => document.getElementById(id);
  const loginUrl = window.location.protocol === 'file:' ? '../pages/login.html' : '/pages/login.html';

  function readStorage(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  function clearStorage() {
    for (const key of ['token', 'refreshToken', 'user']) {
      try { localStorage.removeItem(key); } catch { /* Navigation still ends the local session. */ }
    }
  }

  window.addEventListener('error', event => {
    if (!event.message) return;
    const accessState = byId('access-state');
    if (!accessState || accessState.hidden) return;
    accessState.textContent = `Admin page script error: ${event.message}`;
    accessState.dataset.kind = 'error';
  });

  byId('logout-button')?.addEventListener('click', () => {
    const refreshToken = readStorage('refreshToken');
    clearStorage();
    if (refreshToken && window.APP_CONFIG?.API_BASE) {
      fetch(`${window.APP_CONFIG.API_BASE}/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        keepalive: true
      }).catch(() => {});
    }
    window.location.replace(loginUrl);
  });

  window.setTimeout(() => {
    const accessState = byId('access-state');
    if (accessState && !accessState.hidden && accessState.textContent.includes('Checking your admin access')) {
      accessState.textContent = window.__schedulaAdminStarted
        ? 'Admin access timed out. Check the API address, sign-in session, and backend response, then reload this page.'
        : 'The admin application script did not start. Reload this page and check the browser console for a script loading error.';
      accessState.setAttribute('data-kind', 'error');
      byId('current-user').textContent = 'Access check timed out';
      byId('environment-badge').textContent = 'Unavailable';
    }
  }, 10000);
})();
