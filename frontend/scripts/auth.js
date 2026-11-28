/**
 * @file auth.js
 * @description Manages user authentication, route guards, token extraction, navigation updates, and login/signup flows.
 */

const SCHEDULA_HANDOFF_PREFIX = 'schedula-auth-handoff:';
let bootstrappedToken = null;

function storeSessionHandoff(token, user) {
  if (token) {
    bootstrappedToken = token;
    try { localStorage.setItem('token', token); } catch { /* Keep the in-memory token for this page. */ }
  }
  if (user) {
    try { localStorage.setItem('user', typeof user === 'string' ? user : JSON.stringify(user)); } catch { /* User display data is optional. */ }
  }
}

function consumeSessionHandoff() {
  try {
    const handoff = window.name;
    if (handoff.startsWith(SCHEDULA_HANDOFF_PREFIX)) {
      window.name = '';
      const session = JSON.parse(handoff.slice(SCHEDULA_HANDOFF_PREFIX.length));
      storeSessionHandoff(session.token, session.user);
    }
  } catch {
    if (String(window.name || '').startsWith(SCHEDULA_HANDOFF_PREFIX)) window.name = '';
  }

  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('token');
  if (urlToken) {
    storeSessionHandoff(urlToken, params.get('user'));
    params.delete('token');
    params.delete('user');
    const cleanSearch = params.toString();
    const cleanUrl = `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}${window.location.hash}`;
    try { window.history.replaceState(null, document.title, cleanUrl); } catch { /* Continue auth; the usual same-origin case is replaceable. */ }
  }
}

consumeSessionHandoff();

// Centralized fetch wrapper to intercept and refresh expired tokens
(function () {
  const originalFetch = window.fetch;
  window.SCHEDULA_RAW_FETCH = originalFetch;
  let isRefreshing = false;
  let refreshSubscribers = [];

  function subscribeTokenRefresh(cb) {
    refreshSubscribers.push(cb);
  }

  function onTokenRefreshed(newToken) {
    refreshSubscribers.forEach(cb => cb(newToken));
    refreshSubscribers = [];
  }

  function clearLocalSession() {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  }

  window.fetch = async function (resource, options = {}) {
    const url = typeof resource === 'string' ? resource : (resource.url || '');

    // Avoid intercepting login, signup, refresh, or logout calls to prevent recursive infinite loops
    if (url.includes('/api/login') || url.includes('/api/signup') || url.includes('/api/refresh') || url.includes('/api/logout')) {
      return originalFetch(resource, options);
    }

    // Execute the original fetch request
    let response;
    try {
      response = await originalFetch(resource, options);
    } catch (err) {
      throw err;
    }

    // Intercept 401 Unauthorized status (indicates access token expiration)
    if (response.status === 401) {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        return response; // No refresh token available, let the 401 bubble up
      }

      if (!isRefreshing) {
        isRefreshing = true;

        try {
          const refreshController = new AbortController();
          const refreshTimeout = window.setTimeout(() => refreshController.abort(), 5000);
          const refreshRes = await originalFetch(`${window.APP_CONFIG.API_BASE}/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
            signal: refreshController.signal
          });
          window.clearTimeout(refreshTimeout);

          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            localStorage.setItem('token', refreshData.token);
            if (refreshData.refreshToken) {
              localStorage.setItem('refreshToken', refreshData.refreshToken);
            }

            isRefreshing = false;
            onTokenRefreshed(refreshData.token);

            // Retry the original request that triggered the refresh
            const newOptions = { ...options };
            if (newOptions.headers) {
              if (newOptions.headers instanceof Headers) {
                newOptions.headers.set('Authorization', `Bearer ${refreshData.token}`);
              } else if (Array.isArray(newOptions.headers)) {
                const authIndex = newOptions.headers.findIndex(([k]) => k.toLowerCase() === 'authorization');
                if (authIndex !== -1) {
                  newOptions.headers[authIndex] = ['Authorization', `Bearer ${refreshData.token}`];
                } else {
                  newOptions.headers.push(['Authorization', `Bearer ${refreshData.token}`]);
                }
              } else {
                newOptions.headers = { ...options.headers };
                const authKey = Object.keys(newOptions.headers).find(k => k.toLowerCase() === 'authorization') || 'Authorization';
                newOptions.headers[authKey] = `Bearer ${refreshData.token}`;
              }
            } else {
              newOptions.headers = { 'Authorization': `Bearer ${refreshData.token}` };
            }
            return originalFetch(resource, newOptions);
          } else {
            // Refresh token has failed (expired, deleted, etc.) - force clean logout
            isRefreshing = false;
            clearLocalSession();
            onTokenRefreshed(null);

            // Redirect to login page if we are not already on an auth page
            const pathname = window.location.pathname;
            const isLandingOrAuth = pathname.endsWith('/') || pathname.includes('index.html') || pathname.includes('login.html') || pathname.includes('signup.html');
            if (!isLandingOrAuth) {
              const isInsidePages = pathname.includes('/pages/');
              const loginPath = isInsidePages ? './login.html' : './pages/login.html';
              window.location.href = loginPath;
            }
            return response;
          }
        } catch (refreshErr) {
          isRefreshing = false;
          console.error('Failed to perform silent token refresh:', refreshErr);
          clearLocalSession();
          onTokenRefreshed(null);
          return response;
        }
      }

      // If we are already refreshing, queue the request until refresh completes
      return new Promise((resolve) => {
        subscribeTokenRefresh((newToken) => {
          if (!newToken) {
            resolve(originalFetch(resource, options));
            return;
          }
          // Re-clone options and update Authorization header
          const newOptions = { ...options };
          if (newOptions.headers) {
            if (newOptions.headers instanceof Headers) {
              newOptions.headers.set('Authorization', `Bearer ${newToken}`);
            } else if (Array.isArray(newOptions.headers)) {
              const authIndex = newOptions.headers.findIndex(([k]) => k.toLowerCase() === 'authorization');
              if (authIndex !== -1) {
                newOptions.headers[authIndex] = ['Authorization', `Bearer ${newToken}`];
              } else {
                newOptions.headers.push(['Authorization', `Bearer ${newToken}`]);
              }
            } else {
              newOptions.headers = { ...options.headers };
              const authKey = Object.keys(newOptions.headers).find(k => k.toLowerCase() === 'authorization') || 'Authorization';
              newOptions.headers[authKey] = `Bearer ${newToken}`;
            }
          } else {
            newOptions.headers = { 'Authorization': `Bearer ${newToken}` };
          }
          resolve(originalFetch(resource, newOptions));
        });
      });
    }

    return response;
  };
})();

/** @returns {string|null} The current session token */
function getToken() {
  try { return localStorage.getItem('token') || bootstrappedToken; }
  catch { return bootstrappedToken; }
}

/**
 * Redirects without putting credentials into the address bar.
 * @param {string} targetUrl - Target path of the page to redirect to
 */
function redirectWithToken(targetUrl) {
  let token = bootstrappedToken;
  let user = null;
  try {
    token = localStorage.getItem('token') || token;
    user = localStorage.getItem('user');
  } catch { /* Use the in-memory token when file storage is unavailable. */ }
  if (window.location.protocol === 'file:' && token) {
    window.name = SCHEDULA_HANDOFF_PREFIX + JSON.stringify({ token, user });
  }
  window.location.href = targetUrl;
}
window.redirectWithToken = redirectWithToken;

function getPostLoginUrl(user) {
  const role = user?.role || user?.access;
  if (role !== 'developer' && role !== 'super_admin') return './home.html';
  if (window.location.protocol === 'file:') {
    return window.location.pathname.includes('/pages/')
      ? '../admin/index.html'
      : './admin/index.html';
  }
  return '/admin';
}

/**
 * Core Authentication Guard.
 * Evaluated on page initialization:
 * 1. Synchronizes token status with backend real-time database schema.
 * 2. Diverts authenticated users from authentication landing screens to proper home screens.
 * 3. Injects custom navigational buttons for admins.
 * 4. Limits UI administrative settings access if matching standard super admin accounts.
 */
async function initAuth() {
  const token = getToken();

  if (token) {
    try {
      // Keep local session status completely synchronized with real-time backend updates
      const response = await fetch(`${window.APP_CONFIG.API_BASE}/user-session`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const freshUser = await response.json();
        localStorage.setItem('user', JSON.stringify(freshUser));
        if (typeof window.populateProfileFromUser === 'function') {
          window.populateProfileFromUser(freshUser);
        }

        const pathname = window.location.pathname;
        const isAdminDocument = pathname.includes('/admin/');
        const isLandingOrAuth = !isAdminDocument && (pathname.endsWith('/') || pathname.includes('index.html') || pathname.includes('login.html') || pathname.includes('signup.html'));

        if (isLandingOrAuth) {
          redirectWithToken(getPostLoginUrl(freshUser));
        }
      } else {
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        } else {
          console.warn('Backend session check error. Falling back to local offline session cache.');
          fallbackAutologinRedirect();
        }
      }
    } catch (e) {
      console.error('Error syncing user session:', e);
      fallbackAutologinRedirect();
    }
  }

  // Populate navigation bar metadata
  const currentUserStr = localStorage.getItem('user');
  if (currentUserStr) {
    try {
      const u = JSON.parse(currentUserStr);
      populateHeaderUsername(u);
    } catch (e) {
      console.error('Error loading current user details for headers:', e);
    }
  }
}

/**
 * Formats and inserts the username in the upper-right navigational header panel.
 * Safeguards layout bounds by truncating names exceeding character limits.
 * Additionally disables edit privileges for standard super admin accounts.
 * @param {Object} user - User metadata object
 */
function populateHeaderUsername(user) {
  const display = document.getElementById('header-username-display');
  if (display && user) {
    const rawName = user.username || user.name || user.email || 'User';
    display.textContent = rawName.length > 50 ? rawName.slice(0, 50) + '…' : rawName;
    display.title = rawName;
  }

}

// Attach lifecycle events
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuth);
} else {
  initAuth();
}

/**
 * Fallback Route Guard.
 * Executed if the backend server is temporarily offline. Prevents page hanging by using cached local user state.
 */
function fallbackAutologinRedirect() {
  const userStr = localStorage.getItem('user');
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      const pathname = window.location.pathname;
      const isAdminDocument = pathname.includes('/admin/');
      const isLandingOrAuth = !isAdminDocument && (pathname.endsWith('/') || pathname.includes('index.html') || pathname.includes('login.html') || pathname.includes('signup.html'));

      if (isLandingOrAuth) {
        redirectWithToken(getPostLoginUrl(user));
      }
    } catch (e) {
      console.error('Offline fallback redirection parsing error:', e);
    }
  }
}

// -------------------------------------------------------------
// USER ACCESS EVENT INTERFACES
// -------------------------------------------------------------

const loginButton = document.querySelector('.login-btn');
const signupButton = document.querySelector('.signup-btn');
const signupTermsCheckbox = document.getElementById('signup-terms-checkbox');
const signupTermsGroup = document.getElementById('signup-terms');
const signupTermsLink = document.getElementById('signup-terms-link');
const forgotButton = document.getElementById('forgot-password');
const signupLinkButton = document.getElementById('signup');
const loginLinkButton = document.getElementById('login');
const closeButton = document.querySelector('.close-btn');

document.querySelectorAll('[data-password-toggle]').forEach(button => {
  const input = document.getElementById(button.dataset.passwordToggle);
  if (!input) return;
  button.addEventListener('mousedown', event => event.preventDefault());
  button.addEventListener('click', () => {
    const wasFocused = document.activeElement === input;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    button.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
    button.setAttribute('aria-pressed', String(reveal));
    button.querySelectorAll('svg').forEach((icon, index) => { icon.hidden = reveal ? index === 0 : index !== 0; });
    if (start !== null && end !== null) input.setSelectionRange(start, end);
    if (wasFocused) input.focus({ preventScroll: true });
  });
});

// Login Event Trigger
let loginRequestInFlight = false;
if (loginButton) {
  loginButton.addEventListener('click', async () => {
    if (loginRequestInFlight) return;
    const email = document.querySelector('input[type="email"]').value.trim();
    const password = document.getElementById('login-password').value.trim();

    if (!email || !password) {
      alert('Please enter both email and password.');
      return;
    }

    loginRequestInFlight = true;
    loginButton.disabled = true;
    loginButton.setAttribute('aria-busy', 'true');
    loginButton.classList.add('is-processing');
    loginButton.textContent = 'Checking...';
    let loginSucceeded = false;
    try {
      const response = await fetch(`${window.APP_CONFIG.API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      if (response.ok) {
        localStorage.setItem('token', data.token);
        if (data.refreshToken) {
          localStorage.setItem('refreshToken', data.refreshToken);
        }
        localStorage.setItem('user', JSON.stringify(data.user));
        loginSucceeded = true;
        redirectWithToken(getPostLoginUrl(data.user));
      } else {
        alert(data.error);
      }
    } catch (error) {
      alert('Login failed');
    } finally {
      loginRequestInFlight = false;
      if (!loginSucceeded) {
        loginButton.disabled = false;
        loginButton.removeAttribute('aria-busy');
        loginButton.classList.remove('is-processing');
        loginButton.textContent = 'Log in';
      }
    }
  });
}

// Signup Event Trigger
let signupVerificationPending = false;
let signupRequestInFlight = false;
let signupVerified = false;
function setSignupButtonDisabled(disabled) {
  if (!signupButton) return;
  const locked = Boolean(disabled);
  signupButton.disabled = locked;
  signupButton.setAttribute('aria-disabled', String(locked));
  signupButton.classList.toggle('is-locked', locked);
}
if (signupButton && signupTermsCheckbox) {
  setSignupButtonDisabled(true);
  signupTermsCheckbox.addEventListener('change', () => {
    if (!signupVerificationPending && !signupVerified) {
      setSignupButtonDisabled(!signupTermsCheckbox.checked);
    }
  });
}
if (signupTermsLink) {
  signupTermsLink.addEventListener('click', () => {
    if (typeof window.showFooterModal === 'function') window.showFooterModal('terms');
  });
}
function setSignupButtonLabel(label) {
  const labelElement = signupButton?.querySelector('.signup-btn-label');
  if (labelElement) labelElement.textContent = label;
  else if (signupButton) signupButton.textContent = label;
}
if (signupButton) {
  signupButton.addEventListener('click', async () => {
    if (signupRequestInFlight) return;
    const email = document.querySelector('input[type="email"]').value.trim();
    const password = document.querySelectorAll('input[type="password"]')[0].value.trim();
    const confirmPassword = document.querySelectorAll('input[type="password"]')[1].value.trim();

    const showSignupMessage = (text, error = false) => {
      if (error) {
        if (typeof window.errorPopup === 'function') window.errorPopup(text, 'Unable to sign up');
        else window.alert(text, 'Unable to sign up', 'error');
        return;
      }
      if (typeof window.successPopup === 'function') window.successPopup(text, 'Verification email sent');
      else window.alert(text, 'Verification email sent');
    };

    if (signupVerificationPending) {
      const pin = document.getElementById('signup-pin').value.trim();
      if (!/^\d{6}$/.test(pin)) { showSignupMessage('Enter the 6-digit PIN sent to your email.', true); return; }
      signupRequestInFlight = true;
      setSignupButtonDisabled(true);
      signupButton.setAttribute('aria-busy', 'true');
      signupButton.classList.add('is-processing');
      setSignupButtonLabel('Checking PIN...');
      try {
        const verifyResponse = await fetch(`${window.APP_CONFIG.API_BASE}/verify-signup`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, pin })
        });
        const verifyData = await verifyResponse.json();
        if (!verifyResponse.ok) { showSignupMessage(verifyData.error || 'Email verification failed.', true); return; }
        const loginResponse = await fetch(`${window.APP_CONFIG.API_BASE}/login`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const loginData = await loginResponse.json();
        if (!loginResponse.ok) { showSignupMessage(loginData.error || 'Account created. Please log in.', true); return; }
        localStorage.setItem('token', loginData.token);
        if (loginData.refreshToken) localStorage.setItem('refreshToken', loginData.refreshToken);
        localStorage.setItem('user', JSON.stringify(loginData.user));
        signupVerified = true;
        const continueToSetup = () => redirectWithToken('./setup.html');
        if (typeof window.successPopup === 'function') {
          window.successPopup('Your email has been verified. Continue to set up your account.', 'Email verified', continueToSetup);
        } else {
          window.alert('Your email has been verified. Continue to set up your account.', 'Email verified');
          continueToSetup();
        }
      } catch (error) { showSignupMessage('Email verification failed: ' + error.message, true); }
      finally {
        signupRequestInFlight = false;
        signupButton.classList.remove('is-processing');
        signupButton.removeAttribute('aria-busy');
        setSignupButtonDisabled(signupVerified);
        setSignupButtonLabel(signupVerified ? 'Verified' : 'Verify Email');
      }
      return;
    }

    if (signupTermsCheckbox && !signupTermsCheckbox.checked) {
      showSignupMessage('Please agree to the Terms and Conditions to create an account.', true);
      return;
    }

    if (!email || !password || !confirmPassword) { showSignupMessage('Please fill in all fields.', true); return; }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showSignupMessage('Invalid email address format.', true);
      return;
    }

    if (password !== confirmPassword) {
      showSignupMessage('Passwords do not match.', true);
      return;
    }

    if (password.length < 6 || !/\d/.test(password) || !/[A-Z]/.test(password) || !/[a-z]/.test(password)) {
      showSignupMessage('Password must be at least 6 characters and include a number, an uppercase letter, and a lowercase letter.', true);
      return;
    }

    signupRequestInFlight = true;
    setSignupButtonDisabled(true);
    signupButton.setAttribute('aria-busy', 'true');
    signupButton.classList.add('is-processing');
    setSignupButtonLabel('Sending PIN...');
    try {
      // Call signup endpoint
      const signupResponse = await fetch(`${window.APP_CONFIG.API_BASE}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const signupData = await signupResponse.json();

      if (!signupResponse.ok) {
        showSignupMessage(signupData.error || 'Signup failed.', true);
        return;
      }

      signupVerificationPending = true;
      document.getElementById('signup-password-group').hidden = true;
      document.getElementById('signup-confirm-password-group').hidden = true;
      document.getElementById('signup-pin-group').style.display = 'grid';
      if (signupTermsGroup) signupTermsGroup.hidden = true;
      if (signupTermsCheckbox) signupTermsCheckbox.disabled = true;
      document.getElementById('signup-subtitle').textContent = `Enter the 6-digit PIN sent to ${email}.`;
      setSignupButtonLabel('Verify Email');
      showSignupMessage('We sent a 6-digit verification PIN to your email address.');
    } catch (error) {
      showSignupMessage('Signup failed: ' + error.message, true);
    } finally {
      signupRequestInFlight = false;
      setSignupButtonDisabled(signupVerified || (!signupVerificationPending && Boolean(signupTermsCheckbox && !signupTermsCheckbox.checked)));
      signupButton.removeAttribute('aria-busy');
      signupButton.classList.remove('is-processing');
      setSignupButtonLabel(signupVerificationPending ? 'Verify Email' : 'Create Account');
    }
  });
}

// Password Reset Page Navigation
if (forgotButton) {
  forgotButton.addEventListener('click', () => {
    const pathname = window.location.pathname;
    if (pathname.includes('/pages/')) {
      window.location.href = './forgot-password.html';
    } else {
      window.location.href = './pages/forgot-password.html';
    }
  });
}

// Helper to display premium inline success/error alerts
function showMessage(text, isError = false, title, onClose) {
  if (isError) {
    if (typeof window.errorPopup === 'function') window.errorPopup(text, title || 'Unable to reset password');
    else window.alert(text, title || 'Unable to reset password', 'error');
    return;
  }
  if (typeof window.successPopup === 'function') window.successPopup(text, title || 'Success', onClose);
  else {
    window.alert(text, title || 'Success');
    if (typeof onClose === 'function') onClose();
  }
}

// Forgot Password Form Submit
const forgotSubmitBtn = document.getElementById('forgot-submit-btn');
if (forgotSubmitBtn) {
  forgotSubmitBtn.addEventListener('click', async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const emailInput = document.getElementById('reset-email');
    const email = emailInput.value.trim();
    if (!email) {
      showMessage('Please enter your email address.', true);
      return;
    }

    try {
      forgotSubmitBtn.disabled = true;
      forgotSubmitBtn.textContent = 'Sending...';

      const response = await fetch(`${window.APP_CONFIG.API_BASE}/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await response.json();

      if (response.status === 404 || (data && data.exists === false)) {
        forgotSubmitBtn.disabled = false;
        forgotSubmitBtn.textContent = 'Send Reset PIN';
        if (window.confirmPopup) {
          window.confirmPopup(
            'This email address is not registered in our database. Would you like to sign up for a new account?',
            () => {
              window.location.href = './signup.html';
            },
            null,
            'Account Not Found'
          );
        } else {
          showMessage(data.error || 'This email address is not registered.', true);
        }
        return;
      }

      if (response.ok) {
        // Switch page layout state dynamically
        document.getElementById('forgot-title').textContent = 'Enter PIN';
        document.getElementById('forgot-subtitle').textContent = `A 6-digit verification PIN has been sent to ${email}.`;

        showMessage('A 6-digit verification PIN has been sent to your email address.', false, 'PIN sent');

        // Lock the email input field and switch views
        emailInput.disabled = true;
        document.getElementById('request-pin-section').style.display = 'none';
        document.getElementById('reset-password-section').style.display = 'block';
      } else {
        showMessage(data.error || 'Failed to submit reset request.', true);
        forgotSubmitBtn.disabled = false;
        forgotSubmitBtn.textContent = 'Send Reset PIN';
      }
    } catch (err) {
      showMessage('An error occurred. Please try again.', true);
      forgotSubmitBtn.disabled = false;
      forgotSubmitBtn.textContent = 'Send Reset PIN';
    }
  });
}

// Reset Password Form Submit
const resetSubmitBtn = document.getElementById('reset-submit-btn');
if (resetSubmitBtn) {
  resetSubmitBtn.addEventListener('click', async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const email = document.getElementById('reset-email').value.trim();
    const pin = document.getElementById('reset-pin').value.trim();
    const password = document.getElementById('new-password').value.trim();
    const confirmPassword = document.getElementById('confirm-password').value.trim();

    if (!pin || pin.length !== 6) {
      showMessage('Please enter the 6-digit verification PIN.', true);
      return;
    }

    if (!password || !confirmPassword) {
      showMessage('Please fill in both password fields.', true);
      return;
    }

    if (password !== confirmPassword) {
      showMessage('Passwords do not match.', true);
      return;
    }

    if (password.length < 6 || !/\d/.test(password) || !/[A-Z]/.test(password) || !/[a-z]/.test(password)) {
      showMessage('Password must be at least 6 characters and include a number, an uppercase letter, and a lowercase letter.', true);
      return;
    }

    try {
      resetSubmitBtn.disabled = true;
      resetSubmitBtn.textContent = 'Resetting Password...';

      const response = await fetch(`${window.APP_CONFIG.API_BASE}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, pin, password })
      });
      const data = await response.json();
      if (response.ok) {
        showMessage(
          'Your password has been reset successfully. You can now sign in with your new password.',
          false,
          'Password reset',
          () => { window.location.href = './login.html'; }
        );
      } else {
        showMessage(data.error || 'Failed to reset password.', true);
        resetSubmitBtn.disabled = false;
        resetSubmitBtn.textContent = 'Reset Password';
      }
    } catch (err) {
      showMessage('An error occurred. Please try again.', true);
      resetSubmitBtn.disabled = false;
      resetSubmitBtn.textContent = 'Reset Password';
    }
  });
}

// Redirections between Login and Signup screens
if (signupLinkButton) {
  signupLinkButton.addEventListener('click', () => {
    window.location.href = './signup.html';
  });
}

if (loginLinkButton) {
  loginLinkButton.addEventListener('click', () => {
    window.location.href = './login.html';
  });
}

// Redirections to main splash page
if (closeButton) {
  if (window.location.pathname.includes('login.html') || window.location.pathname.includes('signup.html')) {
    closeButton.addEventListener('click', () => {
      window.location.href = '../index.html';
    });
  }
}
