const API_BASE = window.APP_CONFIG.API_BASE.replace(/\/$/, '');
const rawFetch = window.SCHEDULA_RAW_FETCH || window.fetch.bind(window);

function withTimeout(options, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  return {
    options: { ...options, signal: controller.signal },
    clear: () => window.clearTimeout(timer)
  };
}

async function api(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const timeout = withTimeout({ ...options, headers, cache: 'no-store' });
  let response;
  try {
    response = await rawFetch(`${API_BASE}/admin${path}`, timeout.options);
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Admin API did not respond within 8 seconds. Check that the backend is running and reachable.');
    throw error;
  } finally {
    timeout.clear();
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.requestId = body.request_id || response.headers.get('X-Request-ID');
    throw error;
  }
  return body;
}

async function appApi(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const timeout = withTimeout({ ...options, headers, cache: 'no-store' });
  let response;
  try {
    response = await rawFetch(`${API_BASE}${path}`, timeout.options);
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Session check did not respond within 8 seconds. Check that the backend is running and reachable.');
    throw error;
  } finally {
    timeout.clear();
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

window.AdminApi = { api, appApi };
