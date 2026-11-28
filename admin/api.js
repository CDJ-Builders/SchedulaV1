const api = (path, options = {}) => window.APP_API.request(`/admin${path}`, options, {
  contentType: false,
  timeoutMs: 8000,
  cache: 'no-store',
  emptyResponse: {},
  timeoutMessage: 'Admin API did not respond within 8 seconds. Check that the backend is running and reachable.'
});

const appApi = (path, options = {}) => window.APP_API.request(path, options, {
  contentType: false,
  timeoutMs: 8000,
  cache: 'no-store',
  emptyResponse: {},
  timeoutMessage: 'Session check did not respond within 8 seconds. Check that the backend is running and reachable.'
});

window.AdminApi = { api, appApi };
