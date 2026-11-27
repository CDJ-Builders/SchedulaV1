import { api, appApi } from './api.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escapeHtml = value => window.APP_UTILS.escapeHtml(value == null ? '' : value);
const state = { role: null, view: 'dashboard', initialized: false, refreshTimer: null, pages: { audit: 1, errors: 1 } };

function showToast(message) {
  const toast = $('#admin-toast');
  toast.textContent = message;
  toast.dataset.visible = 'true';
  window.setTimeout(() => { toast.dataset.visible = 'false'; }, 3500);
}

function showAccessError(error) {
  if (error.status === 401 || !localStorage.getItem('token')) {
    window.location.replace('/pages/login.html');
    return;
  }
  const notice = document.createElement('main');
  notice.className = 'card admin-message';
  notice.setAttribute('role', 'alert');
  const text = document.createElement('p');
  text.textContent = error.status === 403
    ? 'Your account does not have developer or super admin access.'
    : error.message;
  notice.appendChild(text);
  const home = document.createElement('a');
  home.className = 'key lav';
  home.href = '/pages/home.html';
  home.textContent = 'Return to Schedula';
  notice.appendChild(home);
  document.body.replaceChildren(notice);
}

async function authorize() {
  if (!localStorage.getItem('token')) {
    window.location.replace('/pages/login.html');
    return false;
  }
  try {
    const [meta, session] = await Promise.all([
      api('/meta'), appApi('/user-session').catch(() => null)
    ]);
    state.role = meta.role;
    $('#current-role').textContent = meta.role.replace('_', ' ');
    $('#superadmin-tools').hidden = meta.role !== 'super_admin';
    $('#current-user').textContent = session?.email || session?.name || 'Signed in';
    $('#environment-badge').textContent = meta.environment || 'Schedula';
    $('#access-state').hidden = true;
    return true;
  } catch (error) {
    showAccessError(error);
    return false;
  }
}

function number(value, digits = 0) {
  return value == null ? 'Unavailable' : Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function setKpis(stats) {
  const cards = [
    ['Users', stats.users?.total, `${number(stats.users?.signups)} new in range`, stats.users?.delta],
    ['Active users', null, stats.active_users?.reason],
    ['Schedules', stats.schedules?.total, `${number(stats.schedules?.created)} created in range`, stats.schedules?.delta],
    ['Schedule entries', stats.schedule_entries?.total, `${number(stats.schedule_entries?.created)} created in range`, stats.schedule_entries?.delta],
    ['Error rate', stats.error_rate == null ? null : `${(stats.error_rate * 100).toFixed(2)}%`, `${number(stats.error_count)} server errors in range`],
    ['p95 latency', stats.p95_latency_ms == null ? null : `${number(stats.p95_latency_ms, 1)} ms`, `Since ${stats.metrics_available_since ? new Date(stats.metrics_available_since).toLocaleString() : 'metrics deployment'}`]
  ];
  $('#kpi-grid').innerHTML = cards.map((card, index) => `
    <article class="card admin-kpi" style="--i:${index}">
      <span class="admin-kpi-label">${escapeHtml(card[0])}</span>
      <strong class="admin-kpi-value">${escapeHtml(numberOrText(card[1]))}</strong>
      <span class="admin-kpi-detail">${escapeHtml(card[2] || deltaText(card[3]))}</span>
    </article>`).join('');
}

function numberOrText(value) { return value == null ? '—' : typeof value === 'string' ? value : number(value); }
function deltaText(value) { return value == null ? '' : `${value > 0 ? '+' : ''}${number(value)} vs prior range`; }

function drawSeries(canvas, points, series, summaryNode) {
  clearChartError(canvas);
  const ctx = canvas.getContext('2d');
  const box = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(box.width * ratio));
  canvas.height = Math.max(1, Math.round(box.height * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, box.width, box.height);
  const padding = { top: 10, right: 8, bottom: 12, left: 8 };
  const width = Math.max(1, box.width - padding.left - padding.right);
  const height = Math.max(1, box.height - padding.top - padding.bottom);
  const max = Math.max(1, ...points.flatMap(point => series.map(item => Number(point[item.key] || 0))));
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--lav').trim();
  ctx.lineWidth = 1;
  for (let line = 0; line < 4; line += 1) {
    const y = padding.top + (height * line / 3);
    ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(padding.left + width, y); ctx.stroke();
  }
  series.forEach((item, seriesIndex) => {
    const color = getComputedStyle(document.documentElement).getPropertyValue(item.color).trim();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = padding.left + (points.length <= 1 ? width / 2 : (width * index / (points.length - 1)));
      const value = Number(point[item.key] || 0);
      const y = padding.top + height - (height * value / max) - (seriesIndex * 2);
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      ctx.fillRect(x - 2, y - 2, 4, 4);
    });
    ctx.stroke();
  });
  const total = series.map(item => `${item.label}: ${points.reduce((sum, point) => sum + Number(point[item.key] || 0), 0)}`).join('; ');
  summaryNode.textContent = `${canvas.getAttribute('aria-label') || 'Chart'} across ${points.length} time buckets. ${total}.`;
}

function drawBreakdown(canvas, rows, summaryNode) {
  clearChartError(canvas);
  const ctx = canvas.getContext('2d');
  const box = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(box.width * ratio));
  canvas.height = Math.max(1, Math.round(box.height * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, box.width, box.height);
  const max = Math.max(1, ...rows.map(row => Number(row.value)));
  const colors = ['--purple', '--plum', '--lav', '--purple-dark'];
  const rowHeight = Math.min(30, (box.height - 8) / Math.max(1, rows.length));
  ctx.font = '12px "Bricolage Grotesque", sans-serif';
  rows.slice(0, 7).forEach((row, index) => {
    const y = 6 + index * rowHeight;
    const label = String(row.label).slice(0, 32);
    const barWidth = Math.max(2, (box.width - 96) * Number(row.value) / max);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(colors[index % colors.length]).trim();
    ctx.fillRect(0, y + 4, barWidth, rowHeight - 10);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--plum').trim();
    ctx.fillText(`${label} · ${number(row.value)}`, 0, y + rowHeight - 4);
  });
  summaryNode.textContent = `Top routes by request volume: ${rows.map(row => `${row.label}, ${row.value}`).join('; ') || 'no data'}.`;
}

function showChartError(canvasId, summaryId, error) {
  const canvas = $(`#${canvasId}`);
  const message = `Chart unavailable: ${error.message}`;
  canvas.hidden = true;
  let note = canvas.parentElement.querySelector('.admin-chart-error');
  if (!note) {
    note = document.createElement('p');
    note.className = 'admin-chart-error';
    canvas.parentElement.appendChild(note);
  }
  note.textContent = message;
  $(`#${summaryId}`).textContent = message;
}

function clearChartError(canvas) {
  canvas.hidden = false;
  canvas.parentElement.querySelector('.admin-chart-error')?.remove();
}

function addPager(container, pagination) {
  if (!pagination) return;
  const pager = document.createElement('div');
  pager.className = 'admin-pagination';
  const label = document.createElement('span');
  label.textContent = `Page ${pagination.page}`;
  const previous = document.createElement('button');
  previous.className = 'key sm'; previous.type = 'button'; previous.textContent = 'Previous'; previous.disabled = pagination.page <= 1;
  previous.addEventListener('click', () => pagination.onPage(pagination.page - 1));
  const next = document.createElement('button');
  next.className = 'key sm'; next.type = 'button'; next.textContent = 'Next'; next.disabled = !pagination.hasMore;
  next.addEventListener('click', () => pagination.onPage(pagination.page + 1));
  pager.append(label, previous, next);
  container.appendChild(pager);
}

function renderTable(container, headings, rows, emptyMessage, renderRow, pagination) {
  if (!rows?.length) {
    container.innerHTML = `<div class="admin-empty">${escapeHtml(emptyMessage)}</div>`;
    addPager(container, pagination);
    return;
  }
  container.innerHTML = `<div class="table-scroll"><table class="admin-table"><thead><tr>${headings.map(item => `<th scope="col">${escapeHtml(item)}</th>`).join('')}</tr></thead><tbody>${rows.map((row, index) => renderRow(row, Math.min(index, 8))).join('')}</tbody></table></div>`;
  addPager(container, pagination);
}

function auditRow(row, index) {
  return `<tr style="--i:${index}"><td>${escapeHtml(new Date(row.created_at).toLocaleString())}</td><td><code>${escapeHtml(row.action)}</code></td><td>${escapeHtml(row.resource)}<br><code>${escapeHtml(row.resource_id || '')}</code></td><td>${escapeHtml(row.actor_role)}<br><code>${escapeHtml(row.actor_id || 'system')}</code></td><td><pre class="admin-pre">${escapeHtml(JSON.stringify({ before: row.before, after: row.after }, null, 2))}</pre></td></tr>`;
}

function errorRow(row, index) {
  return `<tr style="--i:${index}"><td>${escapeHtml(new Date(row.created_at).toLocaleString())}</td><td>${escapeHtml(row.route)}</td><td>${escapeHtml(row.message)}<br><code>${escapeHtml(row.request_id)}</code></td><td><pre class="admin-pre">${escapeHtml(row.stack || '')}</pre></td></tr>`;
}

async function loadAudit(container, filters = {}) {
  const isFullPage = container === $('#audit-table');
  const page = isFullPage ? state.pages.audit : 1;
  const limit = isFullPage ? 25 : 10;
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
  container.textContent = 'Loading audit events…';
  const result = await api(`/audit?${params}`).catch(error => {
    container.textContent = `Could not load audit events: ${error.message}`;
    throw error;
  });
  renderTable(container, ['Time', 'Action', 'Resource', 'Actor', 'Change'], result.rows, 'No audit events recorded yet.', auditRow, isFullPage ? {
    page, hasMore: result.rows.length === limit,
    onPage: nextPage => { state.pages.audit = nextPage; loadAuditPage(); }
  } : null);
}

async function loadErrors(container, filters = {}) {
  const isFullPage = container === $('#error-table');
  const page = isFullPage ? state.pages.errors : 1;
  const limit = isFullPage ? 25 : 10;
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
  container.textContent = 'Loading error records…';
  const result = await api(`/logs/errors?${params}`).catch(error => {
    container.textContent = `Could not load error records: ${error.message}`;
    throw error;
  });
  renderTable(container, ['Time', 'Route', 'Error', 'Stack'], result.rows, 'No server errors recorded.', errorRow, isFullPage ? {
    page, hasMore: result.rows.length === limit,
    onPage: nextPage => { state.pages.errors = nextPage; loadErrorPage(); }
  } : null);
}

async function loadHealth() {
  $('#health-details').textContent = 'Loading health diagnostics…';
  const health = await api('/health').catch(error => {
    $('#health-details').textContent = `Could not load health diagnostics: ${error.message}`;
    throw error;
  });
  const components = [
    ['API', health.api], ['Database', health.database], ['SchedulaML', health.dependencies.schedulaml], ['SMTP', health.dependencies.smtp]
  ];
  $('#health-strip').innerHTML = components.map(([label, component]) => `<div class="health-chip" data-status="${escapeHtml(component.status)}"><span>${escapeHtml(label)} · ${escapeHtml(component.status.toUpperCase())}</span><small>${component.latency_ms == null ? '—' : `${escapeHtml(number(component.latency_ms, 1))} ms`}</small></div>`).join('');
  $('#health-details').innerHTML = components.map(([label, component], index) => `
    <section class="card admin-health-card" style="--i:${index}"><h2>${escapeHtml(label)} · ${escapeHtml(component.status.toUpperCase())}</h2>
      <div class="well"><pre>${escapeHtml(JSON.stringify(component, null, 2))}</pre></div></section>`).join('');
  return health;
}

async function loadDashboard() {
  const range = $('#dashboard-range').value;
  const results = await Promise.allSettled([
    api(`/stats/overview?range=${encodeURIComponent(range)}`), loadHealth(),
    api(`/stats/timeseries?metric=signups&range=${encodeURIComponent(range)}`),
    api(`/stats/timeseries?metric=requests&range=${encodeURIComponent(range)}`),
    api(`/stats/timeseries?metric=errors&range=${encodeURIComponent(range)}`),
    api(`/stats/timeseries?metric=schedules_created&range=${encodeURIComponent(range)}`),
    api(`/stats/timeseries?metric=entries_created&range=${encodeURIComponent(range)}`),
    api(`/stats/timeseries?metric=smart_schedule_calls&range=${encodeURIComponent(range)}`),
    api('/stats/breakdown?metric=users_by_role'),
    api('/stats/breakdown?metric=entries_by_modality'),
    api('/stats/breakdown?metric=top_routes'), loadAudit($('#recent-audit')), loadErrors($('#recent-errors'))
  ]);
  const [statsResult, , signupsResult, requestsResult, errorsResult, schedulesResult, entriesResult, smartResult, rolesResult, modalitiesResult, routesResult] = results;
  if (statsResult.status === 'fulfilled') {
    const stats = statsResult.value;
    setKpis(stats);
    $('#unavailable-note').textContent = [stats.active_users.reason, stats.conflicts_detected.reason, stats.smart_schedule.reason].join(' ');
  } else {
    $('#access-state').hidden = false;
    $('#access-state').textContent = statsResult.reason.message;
  }
  if (signupsResult.status === 'fulfilled') drawSeries($('#chart-signups'), signupsResult.value.points, [{ key: 'value', label: 'Signups', color: '--purple' }], $('#summary-signups'));
  else showChartError('chart-signups', 'summary-signups', signupsResult.reason);
  if (requestsResult.status === 'fulfilled' && errorsResult.status === 'fulfilled') {
    const errors = new Map(errorsResult.value.points.map(point => [String(point.bucket), point.value]));
    const points = requestsResult.value.points.map(point => ({ ...point, errors: errors.get(String(point.bucket)) || 0 }));
    drawSeries($('#chart-requests'), points, [{ key: 'value', label: 'Requests', color: '--purple' }, { key: 'errors', label: 'Errors', color: '--admin-danger-edge' }], $('#summary-requests'));
  } else showChartError('chart-requests', 'summary-requests', requestsResult.reason || errorsResult.reason);
  if (schedulesResult.status === 'fulfilled') drawSeries($('#chart-schedules'), schedulesResult.value.points, [{ key: 'value', label: 'Schedules', color: '--plum' }], $('#summary-schedules'));
  else showChartError('chart-schedules', 'summary-schedules', schedulesResult.reason);
  if (entriesResult.status === 'fulfilled') drawSeries($('#chart-entries'), entriesResult.value.points, [{ key: 'value', label: 'Entries', color: '--lav' }], $('#summary-entries'));
  else showChartError('chart-entries', 'summary-entries', entriesResult.reason);
  if (smartResult.status === 'fulfilled') drawSeries($('#chart-smart'), smartResult.value.points, [{ key: 'value', label: 'Smart schedule', color: '--purple' }], $('#summary-smart'));
  else showChartError('chart-smart', 'summary-smart', smartResult.reason);
  if (rolesResult.status === 'fulfilled') drawBreakdown($('#chart-user-roles'), rolesResult.value.rows, $('#summary-user-roles'));
  else showChartError('chart-user-roles', 'summary-user-roles', rolesResult.reason);
  if (modalitiesResult.status === 'fulfilled') drawBreakdown($('#chart-modalities'), modalitiesResult.value.rows, $('#summary-modalities'));
  else showChartError('chart-modalities', 'summary-modalities', modalitiesResult.reason);
  if (routesResult.status === 'fulfilled') drawBreakdown($('#chart-routes'), routesResult.value.rows, $('#summary-routes'));
  else showChartError('chart-routes', 'summary-routes', routesResult.reason);
  $('#last-updated').textContent = `Last updated ${new Date().toLocaleTimeString()}`;
  $('#access-state').hidden = true;
}

async function loadAuditPage() {
  try {
    await loadAudit($('#audit-table'), {
      actor: $('#audit-actor').value.trim(), resource: $('#audit-resource').value.trim(),
      action: $('#audit-action').value.trim(), from: dateStart($('#audit-from').value), to: dateEnd($('#audit-to').value)
    });
  } catch (error) { showToast(error.message); }
}

async function loadErrorPage() {
  try {
    await loadErrors($('#error-table'), {
      route: $('#error-route').value.trim(), from: dateStart($('#error-from').value), to: dateEnd($('#error-to').value)
    });
  }
  catch (error) { showToast(error.message); }
}

function dateStart(value) { return value ? `${value}T00:00:00.000Z` : ''; }
function dateEnd(value) { return value ? `${value}T23:59:59.999Z` : ''; }

async function activateView(viewName) {
  state.view = viewName;
  $$('.admin-view').forEach(view => { view.hidden = view.dataset.panel !== viewName; });
  $$('[data-view]').forEach(button => {
    if (button.dataset.view === viewName) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  const panel = $(`[data-panel="${viewName}"]`);
  const firstEntry = panel && !panel.classList.contains('has-entered');
  if (viewName === 'dashboard') await loadDashboard();
  if (viewName === 'health') await loadHealth().catch(error => showToast(error.message));
  if (viewName === 'audit') await loadAuditPage();
  if (viewName === 'errors') await loadErrorPage();
  if (firstEntry) panel.classList.add('has-entered');
}

function setupControls() {
  $$('[data-view]').forEach(button => button.addEventListener('click', () => activateView(button.dataset.view)));
  $$('[data-view-link]').forEach(button => button.addEventListener('click', () => activateView(button.dataset.viewLink)));
  $('#dashboard-range').addEventListener('change', () => loadDashboard().catch(error => showToast(error.message)));
  $('#refresh-health').addEventListener('click', () => loadHealth().then(() => showToast('Health refreshed')).catch(error => showToast(error.message)));
  $('#refresh-audit').addEventListener('click', loadAuditPage);
  $('#filter-audit').addEventListener('click', () => { state.pages.audit = 1; loadAuditPage(); });
  $('#refresh-errors').addEventListener('click', loadErrorPage);
  $('#filter-errors').addEventListener('click', () => { state.pages.errors = 1; loadErrorPage(); });
  $('#role-change-form').addEventListener('submit', async event => {
    event.preventDefault();
    const id = $('#role-target').value.trim();
    const password = $('#stepup-password').value;
    try {
      await api(`/access/users/${encodeURIComponent(id)}/role`, {
        method: 'PATCH', body: JSON.stringify({ password, role: $('#role-value').value })
      });
      $('#stepup-password').value = '';
      showToast('Role updated and recorded in the audit log.');
    } catch (error) { showToast(error.message); }
  });
  const runMaintenance = async (action, button) => {
    const password = $('#stepup-password').value;
    if (!password) { showToast('Enter your current password first.'); $('#stepup-password').focus(); return; }
    button.disabled = true;
    try {
      const result = await api(`/maintenance/${action}`, { method: 'POST', body: JSON.stringify({ password }) });
      $('#stepup-password').value = '';
      showToast(action === 'prune-logs' ? `Pruned ${JSON.stringify(result.deleted)} expired records.` : `Cleared ${JSON.stringify(result.deleted)} expired session records.`);
    } catch (error) { showToast(error.message); }
    finally { button.disabled = false; }
  };
  $('#prune-logs').addEventListener('click', event => runMaintenance('prune-logs', event.currentTarget));
  $('#clear-sessions').addEventListener('click', event => runMaintenance('clear-expired-sessions', event.currentTarget));
  $('#logout-button').addEventListener('click', async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    try {
      await fetch(`${window.APP_CONFIG.API_BASE}/logout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      window.location.replace('/pages/login.html');
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) window.clearInterval(state.refreshTimer);
    else if (state.initialized) {
      loadDashboard().catch(error => showToast(error.message));
      state.refreshTimer = window.setInterval(() => loadDashboard().catch(error => showToast(error.message)), 30000);
    }
  });
}

setupControls();
authorize().then(allowed => {
  if (!allowed) return;
  state.initialized = true;
  activateView('dashboard').catch(error => showToast(error.message));
  state.refreshTimer = window.setInterval(() => {
    if (!document.hidden) loadDashboard().catch(error => showToast(error.message));
  }, 30000);
});
