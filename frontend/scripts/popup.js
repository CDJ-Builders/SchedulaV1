/**
 * @file popup.js
 * @description Injects high-fidelity custom modal dialogs that override native browser alert() and confirm() APIs. Provides CSS-animated overlays with tailored thematic styling.
 */

(function () {
  const script = document.currentScript;
  if (script && script.src) {
    const assetBase = script.src.replace(/frontend\/scripts\/popup\.js.*$/, '');
    if (!document.querySelector('link[data-schedula-popup]')) {
      const stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = assetBase + 'frontend/css/popup.css';
      stylesheet.dataset.schedulaPopup = '';
      document.head.appendChild(stylesheet);
    }
  }

  /**
   * Overrides the window.alert method.
   * Dynamically formats title headers, CSS theme boundaries, and icon markers based on the message string contents.
   * @param {string} message - Dialogue description
   * @param {string} [title] - Header title override
   */
  window.alert = function (message, title, tone, onClose) {
    let iconHtml = `<svg class="modal-svg" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width: 24px; height: 24px;"><path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>`;
    let defaultTitle = 'Notice';
    let typeClass = 'primary';
    let iconClass = '';
    let titleClass = '';

    const msgLower = (message || '').toLowerCase();
    
    // Classify modal based on threat level or validation state
    if (tone === 'error') {
      iconHtml = `<svg class="modal-svg" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width: 24px; height: 24px;"><path stroke-linecap="round" stroke-linejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;
      defaultTitle = 'Error';
      typeClass = 'error';
      iconClass = 'error';
      titleClass = 'error-text';
    } else if (msgLower.includes('conflict') || msgLower.includes('⚠️') || msgLower.includes('please') || msgLower.includes('must') || msgLower.includes('expired') || msgLower.includes('no events')) {
      iconHtml = `<svg class="modal-svg" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width: 24px; height: 24px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>`;
      defaultTitle = 'Warning';
      typeClass = 'warning';
      iconClass = 'warning';
      titleClass = 'warning-text';
      // Format out the raw emojis from the description string
      message = (message || '').replace('⚠️ ', '').replace('⚠️', '');
    } else if (msgLower.includes('error') || msgLower.includes('invalid') || msgLower.includes('failed') || msgLower.includes('cannot') || msgLower.includes('do not match') || msgLower.includes('not loaded') || msgLower.includes('not found') || msgLower.includes('already exists')) {
      iconHtml = `<svg class="modal-svg" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width: 24px; height: 24px;"><path stroke-linecap="round" stroke-linejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;
      defaultTitle = 'Error';
      typeClass = 'error';
      iconClass = 'error';
      titleClass = 'error-text';
    } else if (msgLower.includes('success') || msgLower.includes('sent')) {
      iconHtml = `<svg class="modal-svg" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width: 24px; height: 24px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;
      defaultTitle = 'Success';
      typeClass = 'success';
      iconClass = 'success';
      titleClass = 'success-text';
    }

    title = title || defaultTitle;

    // Purge outdated modal components
    const existing = document.querySelector('.custom-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';
    overlay.innerHTML = `
      <div class="custom-modal" role="dialog" aria-modal="true" aria-labelledby="cmod-title">
        <div class="custom-modal-icon ${iconClass}">${iconHtml}</div>
        <div class="custom-modal-title ${titleClass}" id="cmod-title">${title}</div>
        <div class="custom-modal-body">${message}</div>
        <div class="custom-modal-actions">
          <button class="custom-modal-btn ${typeClass}" id="custom-alert-ok">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('active'), 10);

    const close = () => {
      if (overlay.dataset.closing === 'true') return;
      overlay.dataset.closing = 'true';
      overlay.classList.add('is-closing');
      overlay.classList.remove('active');
      setTimeout(() => {
        overlay.remove();
        if (typeof onClose === 'function') onClose();
      }, 150);
    };

    overlay.querySelector('#custom-alert-ok').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function onEscape(event) {
      if (event.key !== 'Escape') return;
      close();
      document.removeEventListener('keydown', onEscape);
    });
  };

  window.successPopup = function (message, title, onClose) {
    window.alert(`Success: ${message}`, title || 'Success', null, onClose);
  };

  window.noticePopup = function (message, title) {
    window.alert(message, title || 'Notice');
  };

  window.errorPopup = function (message, title) {
    window.alert(message, title || 'Error', 'error');
  };

  /**
   * Spawns a custom confirmation dialog.
   * Fires the appropriate callback depending on user interaction.
   * @param {string} message - Dialogue description
   * @param {Function} onConfirm - Callback trigger when accepted
   * @param {Function} [onCancel] - Optional cancel trigger when closed
   * @param {string} [title] - Header title
   * @param {string} [confirmType] - Button/theme variant: 'primary' (default), 'warning', or 'error'
   */
  window.confirmPopup = function (message, onConfirm, onCancel, title, confirmType) {
    confirmType = confirmType || 'primary';
    title = title || 'Confirmation';

    // Resolve icon, icon class, and title class based on confirmType
    let iconHtml = `<svg class="modal-svg" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width: 24px; height: 24px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;
    let iconClass = '';
    let titleClass = '';

    if (confirmType === 'warning') {
      iconHtml = `<svg class="modal-svg" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width: 24px; height: 24px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>`;
      iconClass = 'warning';
      titleClass = 'warning-text';
    } else if (confirmType === 'error') {
      iconHtml = `<svg class="modal-svg" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width: 24px; height: 24px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>`;
      iconClass = 'error';
      titleClass = 'error-text';
    }

    const existing = document.querySelector('.custom-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';
    overlay.innerHTML = `
      <div class="custom-modal" role="dialog" aria-modal="true" aria-labelledby="cmod-title">
        <div class="custom-modal-icon ${iconClass}">${iconHtml}</div>
        <div class="custom-modal-title ${titleClass}" id="cmod-title">${title}</div>
        <div class="custom-modal-body">${message}</div>
        <div class="custom-modal-actions">
          <button class="custom-modal-btn secondary" id="custom-confirm-cancel">Cancel</button>
          <button class="custom-modal-btn ${confirmType}" id="custom-confirm-ok">Confirm</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('active'), 10);

    const close = (confirmed) => {
      if (overlay.dataset.closing === 'true') return;
      overlay.dataset.closing = 'true';
      overlay.classList.add('is-closing');
      overlay.classList.remove('active');
      setTimeout(() => {
        overlay.remove();
        if (confirmed && typeof onConfirm === 'function') onConfirm();
        if (!confirmed && typeof onCancel === 'function') onCancel();
      }, 150);
    };

    overlay.querySelector('#custom-confirm-ok').addEventListener('click', () => close(true));
    overlay.querySelector('#custom-confirm-cancel').addEventListener('click', () => close(false));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    document.addEventListener('keydown', function onEscape(event) {
      if (event.key !== 'Escape') return;
      close(false);
      document.removeEventListener('keydown', onEscape);
    });
  };

  /**
   * Unified Account Logout Handler.
   * Cleans security credentials and redirects users back to the landing screen.
   * @param {string} [redirectPath] - Target path redirect key
   */
  window.handleLogout = function (redirectPath) {
    redirectPath = redirectPath || '../index.html';
    window.confirmPopup(
      'Are you sure you want to log out and return to the main landing page?',
      async () => {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
          try {
            await fetch(`${window.APP_CONFIG.API_BASE}/logout`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refreshToken })
            });
          } catch (e) {
            console.error('Failed to notify server for logout session destruction:', e);
          }
        }
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = redirectPath;
      },
      null,
      'Confirm Logout'
    );
  };

})();
