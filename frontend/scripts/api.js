/**
 * Purpose: shared authenticated JSON requests.
 * Loaded after utils.js on profile, setup, team, and admin pages.
 * Requires: window.APP_CONFIG and localStorage; provides: window.APP_API.
 */
window.APP_API = {
  /** Send an authenticated JSON request to the configured API and normalize failures. */
  async request(path, options = {}, config = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    const token = localStorage.getItem('token');
    if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    else if (config.contentType !== false && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

    const requestOptions = { ...options, headers };
    if (config.cache !== undefined && requestOptions.cache === undefined) requestOptions.cache = config.cache;
    let controller;
    let timer;
    if (config.timeoutMs) {
      controller = new AbortController();
      requestOptions.signal = controller.signal;
      timer = window.setTimeout(() => controller.abort(), config.timeoutMs);
    }

    let response;
    try {
      const fetcher = window.SCHEDULA_RAW_FETCH || window.fetch.bind(window);
      response = await fetcher(`${window.APP_CONFIG.API_BASE.replace(/\/$/, '')}${path}`, requestOptions);
    } catch (cause) {
      if (cause.name === 'AbortError' && !config.timeoutMs) throw cause;
      const networkMessage = typeof config.networkMessage === 'function'
        ? config.networkMessage(cause)
        : config.networkMessage;
      const message = cause.name === 'AbortError'
        ? (config.timeoutMessage || 'Request timed out.')
        : (networkMessage || cause.message || 'Unable to reach the Schedula server.');
      const error = new Error(message);
      if (cause.name === 'AbortError') error.name = 'TimeoutError';
      throw error;
    } finally {
      if (timer !== undefined) window.clearTimeout(timer);
    }

    const rawBody = response.status === 204 ? '' : await response.text().catch(() => '');
    let data = {};
    try { data = rawBody ? JSON.parse(rawBody) : {}; } catch { }
    if (!response.ok) {
      let message = data.error;
      if (!message && config.errorMessage) message = config.errorMessage({ response, path, rawBody, data });
      const error = new Error(message || `Request failed (${response.status})`);
      error.status = response.status;
      error.requestId = data.request_id || response.headers.get('X-Request-ID');
      throw error;
    }
    if (response.status === 204) {
      if (config.rejectEmpty) throw new Error(config.emptyMessage || 'The server returned an invalid response.');
      return config.emptyResponse === undefined ? null : config.emptyResponse;
    }
    if (!rawBody && config.rejectEmpty) throw new Error(config.emptyMessage || 'The server returned an invalid response.');
    return data;
  }
};
