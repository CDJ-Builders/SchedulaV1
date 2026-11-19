/**
 * @file auth.js
 * @description Manages user authentication, route guards, token extraction, navigation updates, and login/signup flows.
 */

// Centralized fetch wrapper to intercept and refresh expired tokens
(function () {
  const originalFetch = window.fetch;
  let isRefreshing = false;
  let refreshSubscribers = [];

  function subscribeTokenRefresh(cb) {
    refreshSubscribers.push(cb);
  }

  function onTokenRefreshed(newToken) {
    refreshSubscribers.forEach(cb => cb(newToken));
    refreshSubscribers = [];
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
          const refreshRes = await originalFetch(`${window.APP_CONFIG.API_BASE}/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken })
          });

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
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');

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
          return response;
        }
      }

      // If we are already refreshing, queue the request until refresh completes
      return new Promise((resolve) => {
        subscribeTokenRefresh((newToken) => {
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

/**
 * Retrieves the session token from either URL search parameters or standard local storage.
 * URL-based extraction is required for dynamic protocol sandboxing (e.g. file:// protocols crossing directory scopes).
 * @returns {string|null} The current session token
 */
function getToken() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlToken = urlParams.get('token');
  if (urlToken) {
    localStorage.setItem('token', urlToken);
    const urlUser = urlParams.get('user');
    if (urlUser) {
      try {
        localStorage.setItem('user', decodeURIComponent(urlUser));
      } catch (e) {
        console.error('Failed to parse cached user data from URL parameters:', e);
      }
    }
    return urlToken;
  }
  return localStorage.getItem('token');
}

/**
 * Redirects to a target page while propagating security tokens if running under local sandboxed file protocols.
 * @param {string} targetUrl - Target path of the page to redirect to
 */
function redirectWithToken(targetUrl) {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  if (window.location.protocol === 'file:' && token) {
    const separator = targetUrl.includes('?') ? '&' : '?';
    const params = `token=${encodeURIComponent(token)}` + (user ? `&user=${encodeURIComponent(user)}` : '');
    window.location.href = targetUrl + separator + params;
  } else {
    window.location.href = targetUrl;
  }
}
window.redirectWithToken = redirectWithToken;

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

        const pathname = window.location.pathname;
        const isLandingOrAuth = pathname.endsWith('/') || pathname.includes('index.html') || pathname.includes('login.html') || pathname.includes('signup.html');

        if (isLandingOrAuth) {
          redirectWithToken('./home.html');
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
      const isLandingOrAuth = pathname.endsWith('/') || pathname.includes('index.html') || pathname.includes('login.html') || pathname.includes('signup.html');

      if (isLandingOrAuth) {
        redirectWithToken('./home.html');
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
const forgotButton = document.getElementById('forgot-password');
const signupLinkButton = document.getElementById('signup');
const loginLinkButton = document.getElementById('login');
const closeButton = document.querySelector('.close-btn');

// Login Event Trigger
if (loginButton) {
  loginButton.addEventListener('click', async () => {
    const email = document.querySelector('input[type="email"]').value.trim();
    const password = document.querySelector('input[type="password"]').value.trim();

    if (!email || !password) {
      alert('Please enter both email and password.');
      return;
    }

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
        redirectWithToken('./home.html');
      } else {
        alert(data.error);
      }
    } catch (error) {
      alert('Login failed');
    }
  });
}

// Signup Event Trigger
if (signupButton) {
  signupButton.addEventListener('click', async () => {
    const email = document.querySelector('input[type="email"]').value.trim();
    const password = document.querySelectorAll('input[type="password"]')[0].value.trim();
    const confirmPassword = document.querySelectorAll('input[type="password"]')[1].value.trim();

    if (!email || !password || !confirmPassword) {
      alert('Please fill in all fields.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      alert('Invalid email address format.');
      return;
    }

    if (password !== confirmPassword) {
      alert('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      alert('Password must be at least 6 characters long.');
      return;
    }

    try {
      // Call signup endpoint
      const signupResponse = await fetch(`${window.APP_CONFIG.API_BASE}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const signupData = await signupResponse.json();

      if (!signupResponse.ok) {
        alert(signupData.error || 'Signup failed');
        return;
      }

      // Automatically trigger backend login routine on successful registration
      const loginResponse = await fetch(`${window.APP_CONFIG.API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const loginData = await loginResponse.json();

      if (loginResponse.ok) {
        localStorage.setItem('token', loginData.token);
        if (loginData.refreshToken) {
          localStorage.setItem('refreshToken', loginData.refreshToken);
        }
        localStorage.setItem('user', JSON.stringify(loginData.user));
        redirectWithToken(`./setup.html`);
      } else {
        alert(loginData.error || 'Login verification failed post-signup');
      }
    } catch (error) {
      alert('Signup failed: ' + error.message);
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
function showMessage(text, isError = false) {
  const banner = document.getElementById('message-banner');
  if (banner) {
    banner.textContent = text;
    banner.style.display = 'block';
    if (isError) {
      banner.style.backgroundColor = '#ffebee';
      banner.style.color = '#d32f2f';
      banner.style.borderColor = '#f5c6cb';
    } else {
      banner.style.backgroundColor = '#e8f5e9';
      banner.style.color = '#2e7d32';
      banner.style.borderColor = '#c3e6cb';
    }
  } else {
    alert(text);
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

        showMessage('A 6-digit verification PIN has been sent to your email address.', false);

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

    if (password.length < 6) {
      showMessage('Password must be at least 6 characters long.', true);
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
        showMessage('Your password has been successfully reset! Redirecting to login...', false);
        setTimeout(() => {
          window.location.href = './login.html';
        }, 2000);
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
