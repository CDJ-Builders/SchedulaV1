const API_BASE = window.APP_CONFIG.API_BASE.replace(/\/$/, '');
const rawFetch = window.SCHEDULA_RAW_FETCH || window.fetch.bind(window);

async function api(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);
  let response;
  try {
    response = await rawFetch(`${API_BASE}/admin${path}`, { ...options, headers, cache: 'no-store', signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Admin API request timed out after 8 seconds.');
    throw new Error(`Admin API request failed: ${error.message}`);
  } finally {
    window.clearTimeout(timer);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body;
}

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escapeHtml = value => window.APP_UTILS.escapeHtml(value == null ? '' : value);
const state = { role: null, view: 'dashboard', initialized: false, refreshTimer: null, dashboardPromise: null, insightPage: 0, pages: { audit: 1, errors: 1, users: 1 }, selectedUserId: null };
window.__schedulaAdminStarted = true;

function markBusy(container) {
  container.setAttribute('aria-busy', 'true');
}

function markLoaded(container) {
  container.setAttribute('aria-busy', 'false');
  container.dataset.loaded = 'true';
}

function skeletonMarkup(kind, count, label) {
  return `<div class="schedule-skeleton admin-skeleton admin-skeleton-${kind}" aria-hidden="true">${Array.from({ length: count }, () => '<span></span>').join('')}</div><span class="sr admin-skeleton-status">${label}</span>`;
}

function showSkeleton(container, kind, count, label) {
  markBusy(container);
  if (container.dataset.loaded === 'true') return;
  container.innerHTML = skeletonMarkup(kind, count, label);
}

function showKpiSkeletons() {
  const grid = $('#kpi-grid');
  markBusy(grid);
  if (grid.dataset.loaded === 'true') return;
  grid.innerHTML = Array.from({ length: 6 }, () => `
    <article class="admin-kpi admin-kpi-skeleton" aria-hidden="true">
      <div class="schedule-skeleton admin-skeleton">
        <span></span><span></span><span></span>
      </div>
    </article>`).join('') + '<span class="sr">Loading dashboard summary</span>';
}

function showHealthChipSkeletons() {
  const strip = $('#health-strip');
  markBusy(strip);
  if (strip.dataset.loaded === 'true') return;
  strip.innerHTML = Array.from({ length: 4 }, () => `
    <div class="health-chip admin-chip-skeleton" aria-hidden="true">
      <div class="schedule-skeleton admin-skeleton"><span></span><span></span></div>
    </div>`).join('') + '<span class="sr">Loading system health</span>';
}

function showChartSkeleton(canvas) {
  const plot = canvas.parentElement;
  markBusy(plot);
  if (plot.dataset.loaded === 'true') return;
  plot.classList.add('is-loading');
  canvas.setAttribute('aria-hidden', 'true');
  if (!plot.querySelector('.admin-skeleton-chart')) {
    plot.insertAdjacentHTML('afterbegin', skeletonMarkup('chart', 6, 'Loading chart data'));
  }
}

function clearChartSkeleton(canvas) {
  const plot = canvas.parentElement;
  plot.classList.remove('is-loading');
  plot.querySelector('.admin-skeleton-chart')?.remove();
  plot.querySelector('.admin-skeleton-status')?.remove();
  canvas.removeAttribute('aria-hidden');
  markLoaded(plot);
}

function showToast(message) {
  const toast = $('#admin-toast');
  toast.textContent = message;
  toast.dataset.visible = 'true';
  window.setTimeout(() => { toast.dataset.visible = 'false'; }, 3500);
}

function showAccessError(error) {
  if (error.status === 401 || !localStorage.getItem('token')) {
    for (const key of ['token', 'refreshToken', 'user']) {
      try { localStorage.removeItem(key); } catch { /* Continue to login if storage is unavailable. */ }
    }
    window.location.replace(pageUrl('pages/login.html'));
    return;
  }
  const accessState = $('#access-state');
  accessState.hidden = false;
  accessState.setAttribute('role', 'alert');
  accessState.dataset.kind = 'error';
  accessState.textContent = error.status === 403
    ? (error.message || 'Your account does not have developer or super admin access.')
    : error.message || 'Admin access could not be verified.';
}

function pageUrl(relativePath) {
  if (window.location.protocol === 'file:') return `../${relativePath}`;
  return `/${relativePath}`;
}

async function authorize() {
  if (!localStorage.getItem('token')) {
    window.location.replace(pageUrl('pages/login.html'));
    return false;
  }
  try {
    const meta = await api('/meta');
    let session = null;
    try { session = JSON.parse(localStorage.getItem('user') || 'null'); } catch { session = null; }
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
    ['Schedules', stats.schedules?.total, `${number(stats.schedules?.created)} created in range`, stats.schedules?.delta],
    ['Error rate', stats.error_rate == null ? null : `${(stats.error_rate * 100).toFixed(2)}%`, `${number(stats.error_count)} server errors in range`],
    ['p95 latency', stats.p95_latency_ms == null ? null : `${number(stats.p95_latency_ms, 1)} ms`, `Since ${stats.metrics_available_since ? new Date(stats.metrics_available_since).toLocaleString() : 'metrics deployment'}`]
  ];
  $('#kpi-grid').innerHTML = cards.map((card, index) => `
    <article class="admin-kpi" style="--i:${index}">
      <span class="admin-kpi-label">${escapeHtml(card[0])}</span>
      <strong class="admin-kpi-value">${escapeHtml(numberOrText(card[1]))}</strong>
      <span class="admin-kpi-detail">${escapeHtml(card[2] || deltaText(card[3]))}</span>
    </article>`).join('');
  markLoaded($('#kpi-grid'));
}

function numberOrText(value) { return value == null ? '—' : typeof value === 'string' ? value : number(value); }
function deltaText(value) { return value == null ? '' : `${value > 0 ? '+' : ''}${number(value)} vs prior range`; }

function drawSeries(canvas, points, series, summaryNode) {
  clearChartError(canvas);
  clearChartSkeleton(canvas);
  const ctx = canvas.getContext('2d');
  const box = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(box.width * ratio));
  canvas.height = Math.max(1, Math.round(box.height * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, box.width, box.height);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--surface-white').trim();
  ctx.fillRect(0, 0, box.width, box.height);
  const padding = { top: 22, right: 8, bottom: 24, left: 34 };
  const width = Math.max(1, box.width - padding.left - padding.right);
  const height = Math.max(1, box.height - padding.top - padding.bottom);
  const max = Math.max(1, ...points.flatMap(point => series.map(item => Number(point[item.key] || 0))));
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--lav').trim();
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--plum').trim();
  ctx.lineWidth = 1;
  ctx.font = '11px "Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let line = 0; line < 4; line += 1) {
    const y = padding.top + (height * line / 3);
    ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(padding.left + width, y); ctx.stroke();
    ctx.fillText(number(Math.round(max * (3 - line) / 3)), padding.left - 5, y);
  }
  const tickIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])].filter(index => index >= 0);
  tickIndexes.forEach((index, tickIndex) => {
    const bucketDate = new Date(points[index]?.bucket);
    const tickLabel = Number.isNaN(bucketDate.getTime()) ? String(points[index]?.bucket || '') : bucketDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const x = padding.left + (points.length <= 1 ? width / 2 : width * index / (points.length - 1));
    ctx.textAlign = tickIndex === 0 ? 'left' : tickIndex === tickIndexes.length - 1 ? 'right' : 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(tickLabel, x, box.height - 4);
  });
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
  rows = Array.isArray(rows) ? rows : [];
  clearChartError(canvas);
  clearChartSkeleton(canvas);
  const ctx = canvas.getContext('2d');
  const box = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(box.width * ratio));
  canvas.height = Math.max(1, Math.round(box.height * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, box.width, box.height);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--surface-white').trim();
  ctx.fillRect(0, 0, box.width, box.height);
  const max = Math.max(1, ...rows.map(row => Number(row.value)));
  const colors = ['--purple', '--plum', '--purple-dark'];
  if (!rows.length) {
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--plum').trim();
    ctx.font = '600 13px "Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('No data recorded for this range', 4, 22, Math.max(1, box.width - 8));
  }
  const visibleRows = rows.slice(0, 7);
  const rowHeight = Math.min(30, (box.height - 8) / Math.max(1, visibleRows.length));
  const ink = getComputedStyle(document.documentElement).getPropertyValue('--plum').trim();
  ctx.font = '600 12px "Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif';
  ctx.textBaseline = 'alphabetic';
  visibleRows.forEach((row, index) => {
    const y = 6 + index * rowHeight;
    const label = `${String(row.label).replaceAll('_', ' ')} · ${number(row.value)}`;
    const barWidth = Math.max(0, (box.width - 8) * Number(row.value) / max);
    const color = getComputedStyle(document.documentElement).getPropertyValue(colors[index % colors.length]).trim();
    ctx.fillStyle = ink;
    ctx.fillText(label, 4, y + 11, Math.max(1, box.width - 8));
    ctx.fillStyle = color;
    ctx.fillRect(4, y + 15, barWidth, Math.max(3, rowHeight - 18));
  });
  const chartLabel = canvas.getAttribute('aria-label') || 'Breakdown chart';
  summaryNode.textContent = `${chartLabel}: ${rows.map(row => `${row.label}, ${row.value}`).join('; ') || 'no data'}.`;
}

function showChartError(canvasId, summaryId, error) {
  const canvas = $(`#${canvasId}`);
  clearChartSkeleton(canvas);
  const message = `Chart unavailable: ${error?.message || 'The admin API returned data in an unexpected format.'}`;
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
    markLoaded(container);
    return;
  }
  const tableVariant = container.id === 'audit-table'
    ? ' admin-audit-table'
    : container.id === 'error-table' ? ' admin-error-table'
      : container.id === 'users-table' ? ' admin-user-table' : '';
  container.innerHTML = `<div class="table-scroll"><table class="admin-table${tableVariant}"><thead><tr>${headings.map(item => `<th scope="col">${escapeHtml(item)}</th>`).join('')}</tr></thead><tbody>${rows.map((row, index) => renderRow(row, Math.min(index, 8))).join('')}</tbody></table></div>`;
  addPager(container, pagination);
  markLoaded(container);
}

function auditRow(row, index) {
  return `<tr style="--i:${index}"><td>${escapeHtml(new Date(row.created_at).toLocaleString())}</td><td><code>${escapeHtml(row.action)}</code></td><td>${escapeHtml(row.resource)}<br><code>${escapeHtml(row.resource_id || '')}</code></td><td>${escapeHtml(row.actor_role)}<br><code>${escapeHtml(row.actor_id || 'system')}</code></td><td><pre class="admin-pre">${escapeHtml(JSON.stringify({ before: row.before, after: row.after }, null, 2))}</pre></td></tr>`;
}

function errorRow(row, index) {
  return `<tr style="--i:${index}"><td>${escapeHtml(new Date(row.created_at).toLocaleString())}</td><td>${escapeHtml(row.route)}</td><td>${escapeHtml(row.message)}<br><code>${escapeHtml(row.request_id)}</code></td><td><pre class="admin-pre">${escapeHtml(row.stack || '')}</pre></td></tr>`;
}

function userRow(row, index) {
  const deleted = Boolean(row.deleted_at);
  return `<tr style="--i:${index}"><td data-label="Email / name"><span>${escapeHtml(row.email)}</span><small>${escapeHtml(row.display_name || 'No display name')}</small></td><td data-label="UID"><code>${escapeHtml(row.id)}</code></td><td data-label="Role">${escapeHtml(row.role)}</td><td data-label="Status">${deleted ? 'Deleted' : 'Active'}</td><td data-label="Personal data">${number(row.schedules_count)} schedules</td><td data-label="Preferences">${row.has_preferences ? 'Configured' : 'Not set'}</td><td data-label="View data"><button class="key icon admin-user-view-button" type="button" data-user-id="${escapeHtml(row.id)}" aria-label="View data for ${escapeHtml(row.email)}" title="View data"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.3-6 9.5-6 9.5 6 9.5 6-3.3 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg></button></td></tr>`;
}

function renderUserDetail(user) {
  const account = user.account;
  const section = (title, value) => `<section class="admin-user-detail-section"><h3>${escapeHtml(title)}</h3><div class="well"><pre class="admin-pre">${escapeHtml(value == null ? 'No data configured.' : JSON.stringify(value, null, 2))}</pre></div></section>`;
  const schedulesData = Array.isArray(user.schedules) ? user.schedules : [];
  const schedules = schedulesData.length ? schedulesData.map(schedule => ({
    id: schedule.id, title: schedule.title, timezone: schedule.timezone, color: schedule.color,
    created_at: schedule.created_at, updated_at: schedule.updated_at, deleted_at: schedule.deleted_at,
    context: schedule.context
  })) : null;
  $('#user-detail').innerHTML = `
    <div class="admin-panel-heading"><div><p class="eyebrow">User configuration</p><h2>${escapeHtml(account.email)}</h2></div></div>
    ${section('Account · UID', account)}
    ${section('Profile', user.profile)}
    ${section('Preferences', user.preferences)}
    ${section(`Personal schedules (${schedulesData.length})`, schedules)}`;
}

async function loadUserDetail(userId) {
  const detail = $('#user-detail');
  detail.dataset.loaded = 'false';
  showSkeleton(detail, 'table', 6, 'Loading user configuration');
  try {
    const result = await api(`/users/${encodeURIComponent(userId)}`);
    state.selectedUserId = userId;
    renderUserDetail(result);
    markLoaded(detail);
  } catch (error) {
    detail.innerHTML = `<div class="admin-load-error">Could not load user configuration: ${escapeHtml(error.message)}</div>`;
    markLoaded(detail);
    throw error;
  }
}

async function loadUsers() {
  const container = $('#users-table');
  const page = state.pages.users;
  const limit = 25;
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  const search = $('#user-search').value.trim();
  if (search) params.set('q', search);
  showSkeleton(container, 'table', 6, 'Loading user directory');
  try {
    const result = await api(`/users?${params}`);
    renderTable(container, ['Email / name', 'UID', 'Role', 'Status', 'Personal schedules', 'Preferences', ''], result.rows, 'No users found.', userRow, {
      page, hasMore: page * limit < result.total,
      onPage: nextPage => { state.pages.users = nextPage; loadUsers().catch(error => showToast(error.message)); }
    });
    container.querySelectorAll('[data-user-id]').forEach(button => button.addEventListener('click', () => loadUserDetail(button.dataset.userId).catch(error => showToast(error.message))));
    $('#last-updated').textContent = `Loaded ${number(result.total)} users · ${new Date().toLocaleTimeString()}`;
  } catch (error) {
    container.innerHTML = `<div class="admin-load-error">Could not load users: ${escapeHtml(error.message)}</div>`;
    markLoaded(container);
    throw error;
  }
}

async function loadAudit(container, filters = {}, preloaded = null) {
  const isFullPage = container === $('#audit-table');
  const page = isFullPage ? state.pages.audit : 1;
  const limit = isFullPage ? 25 : 10;
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
  showSkeleton(container, 'table', 5, 'Loading audit events');
  const result = preloaded ? (Array.isArray(preloaded) ? { rows: preloaded } : preloaded) : await api(`/audit?${params}`).catch(error => {
    container.innerHTML = `<div class="admin-load-error">Could not load audit events: ${escapeHtml(error.message)}</div>`;
    markLoaded(container);
    throw error;
  });
  renderTable(container, ['Time', 'Action', 'Resource', 'Actor', 'Change'], result.rows, 'No audit events recorded yet.', auditRow, isFullPage ? {
    page, hasMore: result.has_more ?? result.rows.length === limit,
    onPage: nextPage => { state.pages.audit = nextPage; loadAuditPage(); }
  } : null);
}

async function loadErrors(container, filters = {}, preloaded = null) {
  const isFullPage = container === $('#error-table');
  const page = isFullPage ? state.pages.errors : 1;
  const limit = isFullPage ? 25 : 10;
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
  showSkeleton(container, 'table', 5, 'Loading error records');
  const result = preloaded ? (Array.isArray(preloaded) ? { rows: preloaded } : preloaded) : await api(`/logs/errors?${params}`).catch(error => {
    container.innerHTML = `<div class="admin-load-error">Could not load error records: ${escapeHtml(error.message)}</div>`;
    markLoaded(container);
    throw error;
  });
  renderTable(container, ['Time', 'Route', 'Error', 'Stack'], result.rows, 'No server errors recorded.', errorRow, isFullPage ? {
    page, hasMore: result.has_more ?? result.rows.length === limit,
    onPage: nextPage => { state.pages.errors = nextPage; loadErrorPage(); }
  } : null);
}

async function loadHealth(preloaded = null) {
  const details = $('#health-details');
  showHealthChipSkeletons();
  showSkeleton(details, 'health', 4, 'Loading health diagnostics');
  const health = await (async () => {
    if (preloaded?.error) throw new Error(preloaded.error);
    return preloaded?.data || api('/health');
  })().catch(error => {
    details.innerHTML = `<div class="admin-load-error">Could not load health diagnostics: ${escapeHtml(error.message)}</div>`;
    markLoaded(details);
    $('#health-strip').innerHTML = `<div class="admin-load-error">Health status unavailable</div>`;
    markLoaded($('#health-strip'));
    throw error;
  });
  const unavailableHealth = { status: 'unknown', latency_ms: null, reason: 'Health component data is unavailable.' };
  const components = [
    ['API', health?.api || unavailableHealth],
    ['Database', health?.database || unavailableHealth],
    ['SchedulaML', health?.dependencies?.schedulaml || unavailableHealth],
    ['SMTP', health?.dependencies?.smtp || unavailableHealth]
  ];
  $('#health-strip').innerHTML = components.map(([label, component]) => {
    const status = String(component?.status || 'unknown');
    return `<div class="health-chip" data-status="${escapeHtml(status)}"><span>${escapeHtml(label)} · ${escapeHtml(status.toUpperCase())}</span><small>${component?.latency_ms == null ? '—' : `${escapeHtml(number(component.latency_ms, 1))} ms`}</small></div>`;
  }).join('');
  markLoaded($('#health-strip'));
  details.innerHTML = components.map(([label, component], index) => `
    <section class="card admin-health-card" style="--i:${index}"><h2>${escapeHtml(label)} · ${escapeHtml(String(component?.status || 'unknown').toUpperCase())}</h2>
      <div class="well"><pre>${escapeHtml(JSON.stringify(component, null, 2))}</pre></div></section>`).join('');
  markLoaded(details);
  return health;
}

function toSettled(result) {
  if (result == null) return { status: 'rejected', reason: new Error('The admin API omitted this dashboard panel.') };
  if (result.error) return { status: 'rejected', reason: new Error(result.error) };
  return { status: 'fulfilled', value: Object.prototype.hasOwnProperty.call(result, 'data') ? result.data : result };
}

function hasChartPoints(result) {
  return result.status === 'fulfilled' && Array.isArray(result.value?.points);
}

function hasBreakdownRows(result) {
  return result.status === 'fulfilled' && (Array.isArray(result.value) || Array.isArray(result.value?.rows));
}

function breakdownRows(result) {
  return Array.isArray(result.value) ? result.value : result.value?.rows || [];
}

function updateInsightPage(page = state.insightPage) {
  const panels = $$('.admin-insight-panel');
  const viewport = $('.admin-insight-viewport');
  if (!panels.length || !viewport) return;
  state.insightPage = Math.max(0, Math.min(panels.length - 1, page));
  const panel = panels[state.insightPage];
  const gap = Number.parseFloat(getComputedStyle($('#insight-track')).columnGap) || 0;
  $('#insight-track').style.transform = `translateX(-${(viewport.clientWidth + gap) * state.insightPage}px)`;
  viewport.style.height = `${panel.offsetHeight}px`;
  $('#insight-page').textContent = `Panel ${state.insightPage + 1} of ${panels.length} · ${state.insightPage === 0 ? 'Usage over time' : 'Breakdowns'}`;
  $('#insight-prev').disabled = state.insightPage === 0;
  $('#insight-next').disabled = state.insightPage === panels.length - 1;
}

function loadDashboard() {
  if (state.dashboardPromise) return state.dashboardPromise;
  state.dashboardPromise = loadDashboardData().finally(() => { state.dashboardPromise = null; });
  return state.dashboardPromise;
}

async function loadDashboardData() {
  const range = $('#dashboard-range').value;
  loadHealth().catch(error => showToast(error.message));
  showKpiSkeletons();
  showHealthChipSkeletons();
  [
    'chart-signups', 'chart-requests', 'chart-schedules', 'chart-smart',
    'chart-user-roles', 'chart-routes'
  ].forEach(id => showChartSkeleton($(`#${id}`)));
  let bundle;
  try {
    const params = new URLSearchParams({ range });
    bundle = await api(`/dashboard?${params}`) || {};
  } catch (error) {
    const displayError = error.status === 404 && error.message === 'Admin endpoint not found'
      ? 'The running backend does not include the dashboard endpoint yet. Restart it from this Schedula workspace or redeploy the updated backend, then reload this page.'
      : error.message;
    $('#access-state').hidden = false;
    $('#access-state').textContent = displayError;
    $('#kpi-grid').innerHTML = `<div class="admin-load-error">Could not load dashboard statistics: ${escapeHtml(displayError)}</div>`;
    markLoaded($('#kpi-grid'));
    ['chart-signups', 'chart-requests', 'chart-schedules', 'chart-smart', 'chart-user-roles', 'chart-routes']
      .forEach(id => showChartError(id, `summary-${id.replace('chart-', '')}`, new Error(displayError)));
    return;
  }
  const series = bundle.series || {};
  const breakdowns = bundle.breakdowns || {};
  const statsResult = toSettled(bundle.stats);
  const signupsResult = toSettled(series.signups);
  const requestsResult = toSettled(series.requests);
  const errorsResult = toSettled(series.errors);
  const schedulesResult = toSettled(series.schedules_created);
  const smartResult = toSettled(series.smart_schedule_calls);
  const rolesResult = toSettled(breakdowns.users_by_role);
  const routesResult = toSettled(breakdowns.top_routes);
  if (statsResult.status === 'fulfilled') {
    const stats = statsResult.value;
    setKpis(stats);
    $('#unavailable-note').textContent = [stats.conflicts_detected?.reason, stats.smart_schedule?.reason].filter(Boolean).join(' ');
  } else {
    $('#access-state').hidden = false;
    $('#access-state').textContent = statsResult.reason.message;
    $('#kpi-grid').innerHTML = `<div class="admin-load-error">Could not load dashboard statistics: ${escapeHtml(statsResult.reason.message)}</div>`;
    markLoaded($('#kpi-grid'));
  }
  if (hasChartPoints(signupsResult)) drawSeries($('#chart-signups'), signupsResult.value.points, [{ key: 'value', label: 'Signups', color: '--purple' }], $('#summary-signups'));
  else showChartError('chart-signups', 'summary-signups', signupsResult.reason);
  if (hasChartPoints(requestsResult) && hasChartPoints(errorsResult)) {
    const errors = new Map(errorsResult.value.points.map(point => [String(point.bucket), point.value]));
    const points = requestsResult.value.points.map(point => ({ ...point, errors: errors.get(String(point.bucket)) || 0 }));
    drawSeries($('#chart-requests'), points, [{ key: 'value', label: 'Requests', color: '--purple' }, { key: 'errors', label: 'Errors', color: '--admin-danger-edge' }], $('#summary-requests'));
  } else showChartError('chart-requests', 'summary-requests', requestsResult.reason || errorsResult.reason);
  if (hasChartPoints(schedulesResult)) drawSeries($('#chart-schedules'), schedulesResult.value.points, [{ key: 'value', label: 'Schedules', color: '--plum' }], $('#summary-schedules'));
  else showChartError('chart-schedules', 'summary-schedules', schedulesResult.reason);
  if (hasChartPoints(smartResult)) drawSeries($('#chart-smart'), smartResult.value.points, [{ key: 'value', label: 'Smart schedule', color: '--purple' }], $('#summary-smart'));
  else showChartError('chart-smart', 'summary-smart', smartResult.reason);
  if (hasBreakdownRows(rolesResult)) drawBreakdown($('#chart-user-roles'), breakdownRows(rolesResult), $('#summary-user-roles'));
  else showChartError('chart-user-roles', 'summary-user-roles', rolesResult.reason);
  if (hasBreakdownRows(routesResult)) drawBreakdown($('#chart-routes'), breakdownRows(routesResult), $('#summary-routes'));
  else showChartError('chart-routes', 'summary-routes', routesResult.reason);
  $('#last-updated').textContent = `Last updated ${new Date().toLocaleTimeString()}`;
  $('#access-state').hidden = true;
  requestAnimationFrame(() => updateInsightPage());
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

function syncDashboardRefresh() {
  window.clearInterval(state.refreshTimer);
  state.refreshTimer = null;
  if (state.initialized && !document.hidden && state.view === 'dashboard') {
    state.refreshTimer = window.setInterval(() => loadDashboard().catch(error => showToast(error.message)), 30000);
  }
}

async function activateView(viewName) {
  state.view = viewName;
  $$('.admin-view').forEach(view => { view.hidden = view.dataset.panel !== viewName; });
  $$('[data-view]').forEach(button => {
    if (button.dataset.view === viewName) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  const panel = $(`[data-panel="${viewName}"]`);
  const firstEntry = panel && !panel.classList.contains('has-entered');
  syncDashboardRefresh();
  if (viewName === 'dashboard') {
    updateInsightPage();
    await loadDashboard();
  }
  if (viewName === 'users') await loadUsers().catch(error => showToast(error.message));
  if (viewName === 'health') await loadHealth().catch(error => showToast(error.message));
  if (viewName === 'audit') await loadAuditPage();
  if (viewName === 'errors') await loadErrorPage();
  if (firstEntry) panel.classList.add('has-entered');
}

function setupControls() {
  $$('[data-view]').forEach(button => button.addEventListener('click', () => activateView(button.dataset.view)));
  $$('[data-view-link]').forEach(button => button.addEventListener('click', () => activateView(button.dataset.viewLink)));
  $('#dashboard-range').addEventListener('change', () => loadDashboard().catch(error => showToast(error.message)));
  $('#insight-prev').addEventListener('click', () => updateInsightPage(state.insightPage - 1));
  $('#insight-next').addEventListener('click', () => updateInsightPage(state.insightPage + 1));
  $('#refresh-users').addEventListener('click', () => loadUsers().catch(error => showToast(error.message)));
  $('#filter-users').addEventListener('click', () => { state.pages.users = 1; loadUsers().catch(error => showToast(error.message)); });
  $('#user-search').addEventListener('keydown', event => {
    if (event.key === 'Enter') { state.pages.users = 1; loadUsers().catch(error => showToast(error.message)); }
  });
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
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) window.clearInterval(state.refreshTimer);
    else if (state.initialized && state.view === 'dashboard') {
      loadDashboard().catch(error => showToast(error.message));
      syncDashboardRefresh();
    }
  });
  window.addEventListener('resize', () => updateInsightPage());
}

setupControls();
updateInsightPage();
authorize().then(allowed => {
  if (!allowed) return;
  state.initialized = true;
  activateView('dashboard').catch(error => showToast(error.message));
});
