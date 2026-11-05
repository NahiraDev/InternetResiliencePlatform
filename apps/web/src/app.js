/*
 * IRP Web Control Center application logic.
 * Connects to the real IRP API endpoints. No mock data; no fake states.
 */
(() => {
  'use strict';

  const API_BASE = '';
  const NOT_REPORTED = 'Not reported';
  let accessToken = null;
  let autoRefresh = true;
  let refreshTimer = null;
  let lastGoodAt = null;
  let inFlight = false;
  let currentView = 'overview';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const VIEWS = {
    overview: ['Live operations', 'Overview'],
    connectivity: ['Reachability', 'Connectivity'],
    providers: ['Provider discovery', 'Providers'],
    'zero-cost': ['Personal mode', 'Zero-cost connectivity'],
    devices: ['Device management', 'Devices'],
    policy: ['Control policy', 'Policy'],
    incidents: ['Recovery', 'Incidents'],
    decisions: ['Decision history', 'Decisions'],
    settings: ['Configuration', 'Settings'],
  };

  // ── Auth state ────────────────────────────────────────────────────────
  function showAuth() {
    $('#app-shell').classList.add('hidden');
    $('#auth-overlay').classList.remove('hidden');
    $('#signin-form').classList.remove('hidden');
    $('#signup-form').classList.add('hidden');
    $('#auth-loading').classList.add('hidden');
    $('#signin-message').classList.add('hidden');
    $('#signup-message').classList.add('hidden');
  }

  function showApp() {
    $('#auth-overlay').classList.add('hidden');
    $('#app-shell').classList.remove('hidden');
    $('#user-email').textContent = '';
  }

  function setAuthLoading(loading) {
    $('#auth-loading').classList.toggle('hidden', !loading);
    $('#signin-submit').disabled = loading;
    $('#signup-submit').disabled = loading;
  }

  function showFormMessage(formId, text, type = 'error') {
    const el = $(`#${formId}-message`);
    el.textContent = text;
    el.className = `message message-${type}`;
    el.classList.remove('hidden');
  }
  function hideFormMessage(formId) {
    $(`#${formId}-message`).classList.add('hidden');
  }

  async function apiRequest(path, init = {}) {
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
    const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
    return res;
  }

  async function apiJson(path, init = {}) {
    const res = await apiRequest(path, init);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.error?.message || `Request failed: ${res.status}`);
      err.status = res.status;
      err.code = body.error?.code;
      throw err;
    }
    return res.json();
  }

  // ── Auth handlers ─────────────────────────────────────────────────────
  async function handleSignin(e) {
    e.preventDefault();
    setAuthLoading(true);
    hideFormMessage('signin');
    const email = $('#signin-email').value;
    const password = $('#signin-password').value;
    try {
      const data = await apiJson('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      accessToken = data.data.accessToken;
      localStorage.setItem('irp_access_token', accessToken);
      showApp();
      initApp();
    } catch (err) {
      showFormMessage('signin', err.message || 'Sign in failed');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignup(e) {
    e.preventDefault();
    setAuthLoading(true);
    hideFormMessage('signup');
    const email = $('#signup-email').value;
    const name = $('#signup-name').value;
    const password = $('#signup-password').value;
    try {
      await apiJson('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, name, password }),
      });
      showFormMessage('signup', 'Account created. Please verify your email, then sign in.', 'ok');
      $('#signup-form').reset();
    } catch (err) {
      showFormMessage('signup', err.message || 'Account creation failed');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignout() {
    try {
      await apiRequest('/api/v1/auth/logout', { method: 'POST' });
    } catch {
      // Ignore signout errors; clear local state regardless.
    }
    accessToken = null;
    localStorage.removeItem('irp_access_token');
    location.reload();
  }

  // ── UI helpers ────────────────────────────────────────────────────────
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function isNum(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  }

  function text(selector, value, fallback) {
    const node = $(selector);
    if (node) node.textContent = value == null || value === '' ? (fallback == null ? NOT_REPORTED : fallback) : String(value);
  }

  function label(value) {
    if (value == null || value === '') return NOT_REPORTED;
    const words = String(value).replace(/[-_]+/g, ' ').toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  function tone(value) {
    const status = String(value == null ? '' : value).toLowerCase();
    if (/unhealthy|unavailable|failed|error|down|critical|disconnected|open$/.test(status)) return 'danger';
    if (/degraded|partial|review|violation|warn/.test(status)) return 'warn';
    if (/observe|advisory/.test(status)) return 'observing';
    if (/healthy|available|passed|success|connected|^up$|closed|enabled|^ok$|noop|not.required/.test(status)) return 'ok';
    return 'unknown';
  }

  const GLYPH = { ok: '●', warn: '▲', danger: '■', observing: '◆', unknown: '○' };

  function setPill(selector, value, wording) {
    const node = $(selector);
    if (!node) return;
    const t = tone(value);
    node.setAttribute('data-tone', t);
    node.innerHTML = `<span class="pill-glyph" aria-hidden="true">${GLYPH[t]}</span><span class="pill-text">${escapeHtml(wording || label(value))}</span>`;
  }

  function toneSpan(value) {
    const t = tone(value);
    return `<span class="tone" data-tone="${t}"><span aria-hidden="true">${GLYPH[t]}</span> ${escapeHtml(label(value))}</span>`;
  }

  function tile(title, detail, stateValue) {
    return `<div class="tile"><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></div>${toneSpan(stateValue)}</div>`;
  }

  function ms(value) {
    return isNum(value) ? Math.round(Number(value)) + ' ms' : NOT_REPORTED;
  }

  // ── Error / loading ───────────────────────────────────────────────────
  function showError(message) {
    const banner = $('#error-banner');
    $('#error-message').textContent = message;
    banner.classList.remove('hidden');
    setPill('#global-status', 'unavailable', 'API unavailable');
    const stale = $('#stale-note');
    if (lastGoodAt) {
      stale.textContent = 'Showing the last successful snapshot from ' + lastGoodAt.toLocaleTimeString() + '. Values may be out of date.';
      stale.classList.remove('hidden');
    } else {
      stale.classList.add('hidden');
    }
    $('#app').classList.remove('is-loading');
    $('#live-region').textContent = 'Unable to load live platform status: ' + message;
  }

  function hideError() {
    $('#error-banner').classList.add('hidden');
    $('#stale-note').classList.add('hidden');
  }

  // ── Views ─────────────────────────────────────────────────────────────
  function showView(name, moveFocus) {
    if (!VIEWS[name]) name = 'overview';
    currentView = name;
    $$('.view').forEach((s) => s.hidden = s.getAttribute('data-view') !== name);
    $$('.nav-item').forEach((a) => {
      if (a.getAttribute('data-view') === name) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    text('#view-eyebrow', VIEWS[name][0]);
    text('#view-title', VIEWS[name][1]);
    document.title = VIEWS[name][1] + ' · IRP Control Center';
    if (moveFocus) $('#main').focus();
  }

  // ── Overview ──────────────────────────────────────────────────────────
  function renderOverview(data) {
    const network = data.network || {};
    const dns = data.dns || {};
    const routing = data.routing || {};
    const recovery = data.recovery || {};
    const decision = data.decision || {};
    const security = data.security || {};
    const autopilot = data.autopilot || {};
    const dependencies = data.dependencies || {};
    const observability = data.observability || {};
    const eventBus = data.eventBus || {};
    const issues = Array.isArray(recovery.issues) ? recovery.issues : [];
    const score = isNum(decision.score) ? Number(decision.score) : NaN;
    const overall = network.health || network.connection;

    setPill('#global-status', overall, overall ? label(overall) : 'Unknown');
    text('#health-score', Number.isFinite(score) ? Math.round(score) : '—');
    text('#health-caption', network.health ? label(network.health) : 'Status not reported');
    text('#connection-state', network.connection || network.health ? label(network.connection || network.health) : '—');
    text('#route-caption', 'Route: ' + (network.currentRoute || 'not reported'));
    text('#dns-latency', isNum(dns.latencyMs) ? Math.round(Number(dns.latencyMs)) : '—');
    text('#dns-caption', dns.health ? label(dns.health) : 'Resolver status not reported');
    text('#incident-count', isNum(autopilot.activeIncidents) ? autopilot.activeIncidents : '—');
    text('#approval-caption', 'Approvals pending: ' + (isNum(autopilot.pendingApprovals) ? autopilot.pendingApprovals : 'not reported'));

    text('#decision-title', decision.recommendation ? label(decision.recommendation) : 'No recommendation reported');
    text('#decision-explanation', decision.explanation, 'No decision explanation was returned.');
    text('#decision-confidence', isNum(decision.confidence) ? Math.round(Number(decision.confidence) * 100) + '%' : NOT_REPORTED);
    text('#decision-mode', label(decision.mode));
    text('#policy-state', label(decision.policyValidation));
    setPill('#decision-chip', decision.securityValidation || decision.policyValidation, decision.securityValidation ? 'Security ' + label(decision.securityValidation).toLowerCase() : 'Policy ' + label(decision.policyValidation).toLowerCase());

    renderModules(data);

    text('#current-route', network.currentRoute);
    text('#connection-detail', label(network.connection));
    text('#routing-status', label(routing.status));
    text('#routing-mode', label(routing.mode));
    setPill('#network-health-chip', overall);
    text('#dns-resolver', dns.resolver);
    text('#dns-latency-detail', ms(dns.latencyMs));
    text('#dns-secure', label(dns.secureTransport));
    text('#dns-policy', label(dns.policyStatus));
    setPill('#dns-chip', dns.health);
    renderInterfaces(network.interfaces);

    const dbLatency = data.diagnostics && data.diagnostics.databaseLatencyMs;
    text('#decision-age', isNum(decision.decisionAgeSeconds) ? decision.decisionAgeSeconds + ' s' : NOT_REPORTED);
    text('#database-latency-metric', ms(dbLatency));

    text('#security-state', label(security.state));
    text('#protection-mode', label(security.protectionState));
    text('#kill-switch', label(security.killSwitch));
    text('#dns-leak', label(security.dnsLeak));
    text('#route-leak', label(security.routeLeak));
    text('#ipv6-state', label(security.ipv6));
    text('#security-validation', label(decision.securityValidation));
    text('#security-explanation', security.explanation, 'Reflects the backend\'s reported posture. Observe-only means enforcement is not active.');
    setPill('#security-chip', security.state);

    setPill('#autopilot-chip', autopilot.enabled ? autopilot.mode : 'observe-only', autopilot.enabled ? label(autopilot.mode) : 'Observe only');
    text('#autopilot-mode', label(autopilot.mode));
    text('#autopilot-enabled', autopilot.enabled ? 'Automation enabled' : 'Automation disabled · observe-only');
    text('#active-actions', isNum(autopilot.activeActions) ? autopilot.activeActions : NOT_REPORTED);
    text('#circuit-breaker', label(autopilot.circuitBreaker));
    text('#verification-state', label(autopilot.verificationState));
    text('#rollback-state', label(autopilot.rollbackState));

    text('#incident-total-count', issues.length);
    setPill('#recovery-chip', recovery.status);
    text('#database-state', label(dependencies.database));
    text('#database-latency', ms(dbLatency));
    text('#queue-state', label(dependencies.queue));
    text('#eventbus-state', eventBus.status ? label(eventBus.status) + (eventBus.scope ? ' (' + eventBus.scope + ')' : '') : NOT_REPORTED);
    const telemetry = observability.telemetry || {};
    text('#telemetry-state', telemetry.enabled === false ? 'Disabled' : (telemetry.enabled ? 'Enabled' : label(observability.metrics)));
    text('#telemetry-exporter', telemetry.exporterConfigured ? 'Configured' : 'Not configured');

    text('#last-updated', data.updatedAt ? new Date(data.updatedAt).toLocaleString() : new Date().toLocaleTimeString());
    text('#source-label', 'Source: ' + (data.source || 'API'));
    lastGoodAt = new Date();
    $('#app').classList.remove('is-loading');
    hideError();
    $('#live-region').textContent = 'Platform status updated: ' + (overall ? label(overall) : 'unknown');
  }

  function renderModules(data) {
    const net = data.network || {}, dns = data.dns || {}, routing = data.routing || {}, recovery = data.recovery || {}, tunnel = data.tunnel || {}, obs = data.observability || {};
    const modules = [
      ['Network', net.health || net.connection, net.currentRoute || 'No route reported'],
      ['DNS', dns.health, dns.resolver || 'No resolver reported'],
      ['Routing', routing.status, routing.mode ? label(routing.mode) : 'No mode reported'],
      ['Recovery', recovery.status, (Array.isArray(recovery.issues) ? recovery.issues.length : 0) + ' issue(s)'],
      ['Tunnel', tunnel.activeTunnel ? 'healthy' : 'unknown', tunnel.activeTunnel ? String(tunnel.activeTunnel) : 'No active tunnel'],
      ['Observability', obs.health, obs.metrics ? 'Metrics ' + label(obs.metrics).toLowerCase() : 'No metrics reported'],
    ];
    $('#module-grid').innerHTML = modules.map((m) => tile(m[0], m[2], m[1])).join('');
  }

  function renderInterfaces(list) {
    const node = $('#interface-list');
    if (!Array.isArray(list) || list.length === 0) {
      node.innerHTML = '<p class="empty-note">No interface probes were reported in the latest snapshot.</p>';
      text('#interface-count', '0 probes');
      return;
    }
    text('#interface-count', list.length + (list.length === 1 ? ' probe' : ' probes'));
    node.innerHTML = list.map((item) => {
      const detail = isNum(item && item.latencyMs) ? 'Latency ' + ms(item.latencyMs) : 'Latency not reported';
      return tile(item && item.name ? item.name : 'Probe', detail, item && item.state);
    }).join('');
  }

  // ── Connectivity ──────────────────────────────────────────────────────
  function renderConnectivity(data) {
    const network = data.network || {};
    const dns = data.dns || {};
    const routing = data.routing || {};
    setPill('#network-health-chip', network.health || network.connection);
    text('#current-route', network.currentRoute);
    text('#connection-detail', label(network.connection));
    text('#routing-status', label(routing.status));
    text('#routing-mode', label(routing.mode));
    text('#dns-resolver', dns.resolver);
    text('#dns-latency-detail', ms(dns.latencyMs));
    text('#dns-secure', label(dns.secureTransport));
    text('#dns-policy', label(dns.policyStatus));
    setPill('#dns-chip', dns.health);
    renderInterfaces(network.interfaces);
  }

  // ── Providers ─────────────────────────────────────────────────────────
  async function renderProviders() {
    const node = $('#provider-list');
    try {
      const data = await apiJson('/api/v1/platform/status');
      const pd = data.data;
      const items = [];
      if (pd.network && pd.network.interfaces) {
        pd.network.interfaces.forEach((iface) => items.push({ name: iface.name || 'Interface', detail: 'Latency ' + ms(iface.latencyMs), state: iface.state || 'unknown' }));
      }
      if (pd.dns) items.push({ name: 'DNS resolver', detail: pd.dns.resolver || 'Not reported', state: pd.dns.health || 'unknown' });
      if (pd.routing) items.push({ name: 'Current route', detail: pd.routing.currentRoute || 'Not reported', state: pd.routing.status || 'unknown' });
      if (pd.gateway) items.push({ name: 'Gateway', detail: pd.gateway.gateway || 'Not reported', state: pd.gateway.available ? 'available' : 'unknown' });
      if (items.length === 0) {
        node.innerHTML = '<p class="empty-note">No providers were reported by the platform status endpoint.</p>';
        return;
      }
      node.innerHTML = items.map((i) => tile(i.name, i.detail, i.state)).join('');
    } catch (err) {
      node.innerHTML = '<p class="empty-note">Unable to load provider data: ' + escapeHtml(err.message) + '</p>';
    }
  }

  // ── Zero-cost mode ────────────────────────────────────────────────────
  async function renderZeroCost() {
    const statusEl = $('#zero-cost-status');
    try {
      const res = await apiRequest('/api/v1/platform/zero-cost', {
        cache: 'no-store',
        headers: { accept: 'application/json', authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Zero-cost API returned HTTP ${res.status}`);
      const payload = await res.json();
      if (!payload || payload.success !== true || !payload.data)
        throw new Error('Unexpected zero-cost response shape');
      const data = payload.data;
      text('#zero-cost-policy', data.policy || 'zero-cost-personal');
      text('#zero-cost-free-count', data.eligibleProviders + ' eligible');
      text('#zero-cost-paid-rejected', data.rejectedPaidProviders + ' rejected');
      text('#zero-cost-current-cost',
        data.currentPathCost !== undefined ? `$${data.currentPathCost.toFixed(2)} / month` : (data.enabled ? '$0.00' : 'Not in zero-cost mode'));
      text('#zero-cost-status',
        data.enabled ? 'Zero-cost mode active · no paid provider required' : 'Zero-cost mode available · not enabled');
      setPill('#global-status', data.enabled ? 'ok' : 'observing', data.enabled ? 'Zero-cost active' : 'Zero-cost available');
      const node = $('#zero-cost-providers');
      if (Array.isArray(data.providers) && data.providers.length > 0) {
        node.innerHTML = data.providers.map((p) => tile(p.id || 'provider', p.type || 'unknown', p.healthy ? 'ok' : 'degraded')).join('');
      } else {
        node.innerHTML = '<p class="empty-note">No zero-cost eligible providers discovered.</p>';
      }
      const enableBtn = $('#zero-cost-enable');
      if (data.enabled) {
        enableBtn.textContent = 'Disable zero-cost mode';
        enableBtn.classList.replace('button-primary', 'button-danger');
      } else {
        enableBtn.textContent = 'Enable zero-cost mode';
        enableBtn.classList.replace('button-danger', 'button-primary');
      }
    } catch (err) {
      text('#zero-cost-status', 'Unable to verify zero-cost eligibility');
    }
  }

  $('#zero-cost-enable').addEventListener('click', async () => {
    const currentlyEnabled = $('#zero-cost-enable').textContent.includes('Disable');
    try {
      const res = await apiRequest('/api/v1/platform/zero-cost/toggle', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ enabled: !currentlyEnabled }),
      });
      if (!res.ok) throw new Error(`Toggle failed: ${res.status}`);
      await renderZeroCost();
    } catch (err) {
      showError('Failed to toggle zero-cost mode: ' + escapeHtml(err.message));
    }
  });

  // ── Policy ────────────────────────────────────────────────────────────
  async function renderPolicy() {
    try {
      const data = await apiJson('/api/v1/runtime/policies');
      const ps = data.data.policySnapshot || {};
      const pol = ps.policy || {};
      text('#policy-autonomous-mode', pol.simulationOnly ? 'Disabled (simulation only)' : 'Enabled');
      text('#policy-preferred-interface', pol.capabilityRequirements ? Object.keys(pol.capabilityRequirements).join(', ') : 'None set');
      text('#policy-allowed-actions', (Array.isArray(pol.allowedActions) ? pol.allowedActions.join(', ') : 'None'));
      text('#policy-confidence-threshold', isNum(pol.confidenceThreshold) ? Math.round(pol.confidenceThreshold * 100) + '%' : NOT_REPORTED);
    } catch (err) {
      text('#policy-autonomous-mode', 'Unable to load');
    }
  }

  $('#policy-autonomous-toggle').addEventListener('change', async (e) => {
    try {
      const mode = e.target.checked ? 'live' : 'safe';
      const res = await apiRequest('/api/v1/runtime/cycle', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ mode, idempotencyKey: `ui-policy-${mode}-${Date.now()}` }),
      });
      if (!res.ok) throw new Error(`Policy update failed: ${res.status}`);
      renderPolicy();
    } catch (err) {
      e.target.checked = !e.target.checked;
      showError('Failed to update policy: ' + escapeHtml(err.message));
    }
  });

  // ── Incidents ─────────────────────────────────────────────────────────
  function renderIncidents(data) {
    const recovery = data.recovery || {};
    const issues = Array.isArray(recovery.issues) ? recovery.issues : [];
    text('#incident-total-count', issues.length);
    const node = $('#incident-list');
    if (issues.length === 0) {
      node.innerHTML = '<li data-tone="ok">● No active recovery issues reported.</li>';
      return;
    }
    node.innerHTML = issues.map((issue) => {
      const value = typeof issue === 'string' ? issue : (issue && (issue.message || issue.reason || issue.code)) || JSON.stringify(issue);
      return `<li data-tone="warn">▲ ${escapeHtml(value)}</li>`;
    }).join('');
  }

  // ── Decisions ─────────────────────────────────────────────────────────
  async function renderDecisions() {
    const node = $('#decisions-list');
    try {
      const data = await apiJson('/api/v1/runtime/decisions');
      const decisions = data.data || [];
      if (decisions.length === 0) {
        node.innerHTML = '<div class="muted">No decisions recorded yet.</div>';
        return;
      }
      node.innerHTML = decisions.map((d) => {
        const outcome = d.outcome || 'unknown';
        return `<div class="list-item" style="padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-control);background:var(--surface-raised);margin-bottom:8px">
          <div><strong>${escapeHtml(d.decisionId)}</strong><small>${escapeHtml(d.outcome)} · ${escapeHtml(d.durationMs != null ? d.durationMs + 'ms' : '')}</small></div>
          <div style="margin-top:4px;font-size:13px;color:var(--muted)">${escapeHtml(d.explanation?.[0] || 'No explanation recorded')}</div>
        </div>`;
      }).join('');
    } catch (err) {
      node.innerHTML = '<p class="empty-note">Unable to load decisions: ' + escapeHtml(err.message) + '</p>';
    }
  }

  // ── Settings ──────────────────────────────────────────────────────────
  function renderSettings() {
    text('#settings-api-endpoint', API_BASE || '(same origin)');
    text('#settings-theme', loadTheme());
    text('#settings-session-status', accessToken ? 'Authenticated' : 'Not authenticated');
  }

  // ── Theme ─────────────────────────────────────────────────────────────
  const THEMES = ['auto', 'light', 'dark'];
  const THEME_KEY = 'irp.dashboard.theme';
  function loadTheme() {
    try { const saved = localStorage.getItem(THEME_KEY); if (THEMES.indexOf(saved) >= 0) return saved; } catch {}
    return 'auto';
  }
  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme); else root.removeAttribute('data-theme');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#F4F7FB' : '#0A0F1C');
  }

  // ── Refresh ───────────────────────────────────────────────────────────
  async function refresh() {
    if (inFlight) return;
    inFlight = true;
    const btn = $('#refresh-button');
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.textContent = 'Refreshing…';
    try {
      const res = await apiRequest('/api/v1/platform/status', { cache: 'no-store', headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error('Platform status API returned HTTP ' + res.status);
      const payload = await res.json();
      if (!payload || payload.success !== true || !payload.data) throw new Error('Unexpected platform status response shape');
      renderOverview(payload.data);
      renderConnectivity(payload.data);
      renderIncidents(payload.data);
      await renderProviders();
      await renderZeroCost();
      await renderPolicy();
      await renderDecisions();
      renderSettings();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showError('Unable to load live platform status: ' + message + '. Check that the API and database are running, then retry.');
    } finally {
      inFlight = false;
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      btn.textContent = 'Refresh';
    }
  }

  function scheduleRefresh() {
    if (refreshTimer) window.clearInterval(refreshTimer);
    refreshTimer = null;
    if (autoRefresh) refreshTimer = window.setInterval(() => { if (!document.hidden) refresh(); }, 30000);
  }

  // ── Init ──────────────────────────────────────────────────────────────
  function initApp() {
    text('#user-email', localStorage.getItem('irp_user_email') || 'User');
    showView(currentView, false);
    applyTheme(loadTheme());
    refresh();
    scheduleRefresh();
  }

  // ── Event wiring ─────────────────────────────────────────────────────
  $('#signin-form').addEventListener('submit', handleSignin);
  $('#signup-form').addEventListener('submit', handleSignup);
  $('#signout-button').addEventListener('click', handleSignout);
  $('#refresh-button').addEventListener('click', refresh);
  $('#retry-button').addEventListener('click', refresh);
  $('#auto-button').addEventListener('click', () => {
    autoRefresh = !autoRefresh;
    $('#auto-button').textContent = 'Auto refresh: ' + (autoRefresh ? 'on' : 'off');
    $('#auto-button').setAttribute('aria-pressed', String(autoRefresh));
    scheduleRefresh();
  });

  $$('.auth-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      $$('.auth-tab').forEach((t) => t.classList.toggle('active', t === tab));
      $$('.auth-form').forEach((f) => f.classList.toggle('hidden', f.id !== target + '-form'));
      hideFormMessage('signin');
      hideFormMessage('signup');
    });
  });

  $$('.nav-item').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      showView(a.getAttribute('data-view'), true);
    });
  });

  // Sidebar toggle (mobile)
  let sidebarOpen = false;
  $('#sidebar-toggle').addEventListener('click', () => {
    sidebarOpen = !sidebarOpen;
    $('#sidebar').classList.toggle('open', sidebarOpen);
    $('#sidebar-toggle').setAttribute('aria-expanded', String(sidebarOpen));
  });

  window.addEventListener('hashchange', () => showView((window.location.hash || '').replace('#', '') || 'overview', true));

  // ── Boot ──────────────────────────────────────────────────────────────
  const stored = localStorage.getItem('irp_access_token');
  if (stored) {
    accessToken = stored;
    showApp();
    initApp();
  } else {
    showAuth();
  }
})();
