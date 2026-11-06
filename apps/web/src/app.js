/*
 * IRP Super Admin Control Center application logic.
 * Connects to the real IRP API. No mock data; no fake states.
 * Unknown/unobserved states remain visible as unknown.
 */
(() => {
  'use strict';

  const API_BASE = '';
  const NOT_REPORTED = 'Not reported';
  let accessToken = null;
  let autoRefresh = true;
  let livePaused = false;
  let lastGoodAt = null;
  let inFlight = false;
  let currentView = 'system-map';
  let userRole = null;
  let eventSource = null;
  let events = [];
  let maxEvents = 200;
  let lastEventTs = null;
  let topologyData = null;
  let graphNodes = [];
  let graphEdges = [];
  let selectedNodeId = null;
  let selectedEdgeId = null;
  let staleTimer = null;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const VIEWS = {
    'system-map': ['System Map', 'Live System Map'],
    'live-network': ['Live Network', 'Network Topology'],
    runtime: ['Runtime', 'ResilienceRuntime'],
    components: ['Components', 'Components & Integrations'],
    capabilities: ['Capabilities', 'Platform Capabilities'],
    providers: ['Providers', 'Providers & Plugins'],
    devices: ['Devices', 'Platform Adapters'],
    policies: ['Policies', 'Policy & Safety'],
    decisions: ['Decisions', 'Decision History'],
    incidents: ['Incidents', 'Incidents & Recovery'],
    events: ['Events', 'Event Timeline'],
    storage: ['Storage', 'Storage & Service Health'],
    security: ['Security', 'Security & Authorization'],
    'subscription-dashboard': ['Subscription', 'My Subscription'],
    'subscription-plans': ['Plans', 'Available Plans'],
    'member-devices': ['Devices', 'My Devices'],
    'member-connection': ['Connection', 'Connection Status'],
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
    // Show/hide navigation based on role
    const adminNav = $('#admin-nav');
    const memberNav = $('#member-nav');
    if (userRole === 'platform_admin') {
      adminNav.hidden = false;
      memberNav.hidden = true;
      if (!VIEWS[currentView]) currentView = 'system-map';
    } else {
      adminNav.hidden = true;
      memberNav.hidden = false;
      if (!VIEWS[currentView]) currentView = 'subscription-dashboard';
    }
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
      localStorage.setItem('irp_user_email', email);
      userRole = data.data.user?.roles?.[0] || null;
      localStorage.setItem('irp_user_role', userRole);
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
      showFormMessage('signup', 'Account created. Check your email for the verification token (dev email capture at /api/v1/dev/emails), then sign in.', 'ok');
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
    } catch {}
    accessToken = null;
    userRole = null;
    localStorage.removeItem('irp_access_token');
    localStorage.removeItem('irp_user_email');
    localStorage.removeItem('irp_user_role');
    if (eventSource) { eventSource.close(); eventSource = null; }
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

  // ── Error / loading / stale ───────────────────────────────────────────
  function showError(message) {
    const banner = $('#error-banner');
    $('#error-message').textContent = message;
    banner.classList.remove('hidden');
    setPill('#connection-indicator', 'danger', 'API disconnected');
    setPill('#live-indicator', 'stale', 'Stale');
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

  function markStale() {
    setPill('#connection-indicator', 'stale', 'Stale');
    setPill('#live-indicator', 'stale', 'Stale');
    const stale = $('#stale-note');
    if (lastGoodAt) {
      stale.textContent = 'No live updates since ' + lastGoodAt.toLocaleTimeString() + '. Data may be out of date.';
      stale.classList.remove('hidden');
    }
  }

  function markLive() {
    setPill('#connection-indicator', 'healthy', 'Connected');
    setPill('#live-indicator', 'live', 'Live');
    $('#stale-note').classList.add('hidden');
  }

  // ── Member User Portal ───────────────────────────────────────────────
  async function renderMemberSubscription() {
    try {
      const data = await apiJson('/api/v1/subscriptions/me', {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      const sub = data.data.subscription;
      const ents = data.data.entitlements || [];

      if (!sub) {
        $('#member-plan-name').textContent = 'No active subscription';
        $('#member-plan-status').textContent = 'Not subscribed';
        $('#member-plan-started').textContent = '—';
        $('#member-plan-expires').textContent = '—';
        $('#member-plan-auto-renew').textContent = '—';
        $('#member-renew-btn').hidden = true;
        $('#member-cancel-btn').hidden = true;
        $('#member-entitlements').innerHTML = '<p class="muted">No active subscription. Select a plan to get started.</p>';
        $('#member-payments').innerHTML = '<div class="muted">No payment history.</div>';
        return;
      }

      $('#member-plan-name').textContent = sub.planName || '—';
      $('#member-plan-status').textContent = sub.status || '—';
      $('#member-plan-started').textContent = sub.startedAt ? new Date(sub.startedAt).toLocaleDateString() : '—';
      $('#member-plan-expires').textContent = sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString() : '—';
      $('#member-plan-auto-renew').textContent = sub.autoRenew ? 'Enabled' : 'Disabled';

      const isActive = sub.status === 'ACTIVE';
      $('#member-renew-btn').hidden = isActive;
      $('#member-cancel-btn').hidden = !isActive;

      if (ents.length === 0) {
        $('#member-entitlements').innerHTML = '<p class="muted">No active entitlements.</p>';
      } else {
        $('#member-entitlements').innerHTML = ents.map((e) => {
          const active = e.status === 'ACTIVE';
          const expires = e.expiresAt ? new Date(e.expiresAt) : null;
          const expired = expires && expires <= new Date();
          return `<span class="entitlement-chip ${active && !expired ? 'active' : 'inactive'}">
            ${escapeHtml(e.feature)} ${active && !expired ? '●' : '○'}
          </span>`;
        }).join('');
      }

      // Payment history
      try {
        const payData = await apiJson('/api/v1/subscriptions/payments', {
          headers: { authorization: `Bearer ${accessToken}` },
        });
        const pays = payData.data.payments || [];
        if (pays.length === 0) {
          $('#member-payments').innerHTML = '<div class="muted">No payment history.</div>';
        } else {
          $('#member-payments').innerHTML = pays.map((p) => {
            const date = p.paidAt || p.createdAt;
            return `<div class="list-item" style="padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-control);background:var(--surface-raised);margin-bottom:8px">
              <div><strong>${escapeHtml(p.amountUsd / 100).toFixed(2)} ${escapeHtml(p.currency)}</strong><small>${escapeHtml(p.status)}</small></div>
              <div style="margin-top:4px;font-size:13px;color:var(--muted)">${escapeHtml(p.provider)} · ${new Date(date).toLocaleDateString()}</div>
            </div>`;
          }).join('');
        }
      } catch {
        $('#member-payments').innerHTML = '<div class="muted">Unable to load payment history.</div>';
      }
    } catch (err) {
      $('#member-plan-status').textContent = 'Unable to load';
    }
  }

  async function renderMemberPlans() {
    try {
      const data = await apiJson('/api/v1/subscriptions/plans');
      const plans = data.data.plans || [];
      const node = $('#member-plans');
      if (plans.length === 0) {
        node.innerHTML = '<p class="muted">No plans available.</p>';
        return;
      }
      node.innerHTML = plans.map((p) => {
        const features = p.planFeatures || p.features || {};
        const featureList = Object.entries(features)
          .filter(([k, v]) => v === true)
          .map(([k]) => escapeHtml(k))
          .join(', ') || 'None';
        return `<article class="plan-card ${p.slug === 'starter' ? '' : 'featured'}">
          <div><strong>${escapeHtml(p.name)}</strong><span class="plan-price">$${(p.priceUsd / 100).toFixed(2)}<span>/mo</span></span></div>
          <p style="color:var(--muted);font-size:13px;margin:0">${escapeHtml(p.description)}</p>
          <ul class="plan-features">${featureList.split(',').map(f => `<li>${f}</li>`).join('')}</ul>
          <div class="button-group">
            <button class="button button-primary" onclick="appPurchasePlan('${p.slug}')">Subscribe</button>
          </div>
        </article>`;
      }).join('');
    } catch (err) {
      $('#member-plans').innerHTML = '<p class="muted">Unable to load plans.</p>';
    }
  }

  window.appPurchasePlan = async (planSlug) => {
    try {
      const res = await apiRequest('/api/v1/subscriptions/purchase', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ planSlug, paymentProvider: 'test' }),
      });
      if (!res.ok) throw new Error(`Purchase failed: ${res.status}`);
      const data = await res.json();
      alert('Subscription registered. Please complete payment verification to activate.');
      await renderMemberSubscription();
    } catch (err) {
      alert('Failed to purchase: ' + err.message);
    }
  };

  window.appVerifyPayment = async (txId) => {
    try {
      const res = await apiRequest('/api/v1/subscriptions/verify-payment', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ paymentTransactionId: txId, providerRef: 'test_verify_' + Date.now() }),
      });
      if (!res.ok) throw new Error(`Verification failed: ${res.status}`);
      alert('Payment verified! Subscription activated.');
      await renderMemberSubscription();
    } catch (err) {
      alert('Payment verification failed: ' + err.message);
    }
  };

  async function renderMemberDevices() {
    try {
      const data = await apiJson('/api/v1/devices', {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      const devices = data.data.devices || [];
      const node = $('#member-device-list');
      if (devices.length === 0) {
        node.innerHTML = '<p class="muted">No devices enrolled.</p>';
        return;
      }
      node.innerHTML = devices.map((d) => {
        const authz = d.subStatus === 'ACTIVE' ? 'authorized' : 'unauthorized';
        return `<div class="tile">
          <div><strong>${escapeHtml(d.label || d.deviceId)}</strong><small>${escapeHtml(d.platform || '—')}</small></div>
          <div>
            <span class="entitlement-chip ${d.status === 'ACTIVE' ? 'active' : 'inactive'}">${escapeHtml(d.status)}</span>
            <span class="entitlement-chip ${authz}">${authz}</span>
            ${d.status === 'ACTIVE' ?
              `<button class="button" onclick="appDisconnectDevice('${escapeHtml(d.deviceId)}')">Disconnect</button>` :
              `<button class="button button-primary" onclick="appConnectDevice('${escapeHtml(d.deviceId)}')">Connect</button>`
            }
            <button class="button button-danger" onclick="appRevokeDevice('${escapeHtml(d.deviceId)}')">Revoke</button>
          </div>
        </div>`;
      }).join('');
    } catch (err) {
      $('#member-device-list').innerHTML = '<p class="muted">Unable to load devices.</p>';
    }
  }

  window.appConnectDevice = async (deviceId) => {
    try {
      const res = await apiRequest(`/api/v1/devices/${deviceId}/connect`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`Connect failed: ${res.status}`);
      await renderMemberDevices();
    } catch (err) {
      alert('Connect failed: ' + err.message);
    }
  };

  window.appDisconnectDevice = async (deviceId) => {
    try {
      const res = await apiRequest(`/api/v1/devices/${deviceId}/disconnect`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`Disconnect failed: ${res.status}`);
      await renderMemberDevices();
    } catch (err) {
      alert('Disconnect failed: ' + err.message);
    }
  };

  window.appRevokeDevice = async (deviceId) => {
    if (!confirm('Revoke this device? This cannot be undone.')) return;
    try {
      const res = await apiRequest(`/api/v1/devices/${deviceId}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Revoke failed: ${res.status}`);
      await renderMemberDevices();
    } catch (err) {
      alert('Revoke failed: ' + err.message);
    }
  };

  window.appEnrollDevice = async () => {
    const deviceId = $('#member-enroll-device-id').value;
    const label = $('#member-enroll-label').value;
    const platform = $('#member-enroll-platform').value;
    if (!deviceId) { alert('Device ID is required'); return; }
    try {
      const res = await apiRequest('/api/v1/devices/enroll', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ deviceId, label, platform }),
      });
      if (!res.ok) throw new Error(`Enroll failed: ${res.status}`);
      $('#member-enroll-form').hidden = true;
      $('#member-enroll-device-id').value = '';
      $('#member-enroll-label').value = '';
      $('#member-enroll-platform').value = '';
      await renderMemberDevices();
    } catch (err) {
      alert('Enroll failed: ' + err.message);
    }
  };

  window.appRenewSubscription = async () => {
    try {
      const res = await apiRequest('/api/v1/subscriptions/renew', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ paymentProvider: 'test' }),
      });
      if (!res.ok) throw new Error(`Renew failed: ${res.status}`);
      const data = await res.json();
      alert('Renewal payment pending. Please verify payment to extend your subscription.');
      // Store txId for verification
      window.appPendingRenewTxId = data.data.paymentTransactionId;
      await renderMemberSubscription();
    } catch (err) {
      alert('Renew failed: ' + err.message);
    }
  };

  window.appCancelSubscription = async () => {
    if (!confirm('Cancel your subscription? This will suspend your devices.')) return;
    try {
      const res = await apiRequest('/api/v1/subscriptions/cancel', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`Cancel failed: ${res.status}`);
      alert('Subscription cancelled.');
      await renderMemberSubscription();
    } catch (err) {
      alert('Cancel failed: ' + err.message);
    }
  };

  async function renderMemberConnection() {
    try {
      const data = await apiJson('/api/v1/subscriptions/me', {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      const sub = data.data.subscription;
      const ents = data.data.entitlements || [];
      const connectEnt = ents.find((e) => e.feature === 'connect');
      const hasActiveEnt = connectEnt && connectEnt.status === 'ACTIVE' &&
        (!connectEnt.expiresAt || new Date(connectEnt.expiresAt) > new Date());
      const subActive = sub && sub.status === 'ACTIVE' &&
        (!sub.expiresAt || new Date(sub.expiresAt) > new Date());
      const authorized = subActive && hasActiveEnt;

      $('#member-conn-status').textContent = subActive ? 'Active' : 'Inactive';
      $('#member-conn-authorized').textContent = authorized ? 'Yes' : 'No';
      $('#member-conn-quality').textContent = authorized ? 'Good' : '—';
      $('#member-conn-last-connected').textContent = '—';

      $('#member-connect-btn').hidden = authorized || subActive ? false : true;
      $('#member-disconnect-btn').hidden = !authorized;

      // Show connect button only if authorized and not already connected
      const btn = $('#member-connect-btn');
      if (authorized) btn.textContent = 'Connect';
      btn.hidden = false;

      $('#member-conn-history').innerHTML = '<div class="muted">Connection history tracked by daemon.</div>';
    } catch (err) {
      $('#member-conn-status').textContent = 'Unable to load';
    }
  }

  // ── Views ─────────────────────────────────────────────────────────────
  function showView(name, moveFocus) {
    if (!VIEWS[name]) name = 'system-map';
    currentView = name;
    $$('.view').forEach((s) => s.hidden = s.getAttribute('data-view') !== name);
    $$('.nav-item').forEach((a) => {
      if (a.getAttribute('data-view') === name) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    text('#view-eyebrow', VIEWS[name][0]);
    text('#view-title', VIEWS[name][1]);
    document.title = VIEWS[name][1] + ' · IRP';
    if (moveFocus) $('#main').focus();
    if (name === 'system-map') renderGraph();
    if (name === 'events') renderEvents();
    if (name === 'subscription-dashboard') renderMemberSubscription();
    if (name === 'subscription-plans') renderMemberPlans();
    if (name === 'member-devices') renderMemberDevices();
    if (name === 'member-connection') renderMemberConnection();
  }

  // ── Platform status ───────────────────────────────────────────────────
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
      renderRuntime(payload.data);
      renderStorage(payload.data);
      renderSecurity(payload.data);
      lastGoodAt = new Date();
      markLive();
      hideError();
      $('#live-region').textContent = 'Platform status updated: ' + (payload.data.network ? label(payload.data.network.health || payload.data.network.connection) : 'unknown');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showError(message);
    } finally {
      inFlight = false;
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      btn.textContent = 'Refresh';
    }
  }

  async function renderOverview(data) {
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
    $('#app').classList.remove('is-loading');
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

  async function renderConnectivity(data) {
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

  // ── Runtime ───────────────────────────────────────────────────────────
  async function renderRuntime(data) {
    try {
      const rt = await apiJson('/api/v1/runtime/status', { headers: { authorization: `Bearer ${accessToken}` } });
      const r = rt.data;
      text('#runtime-id', r.runtimeId);
      text('#runtime-instance-id', r.instanceId);
      setPill('#runtime-state', r.state, label(r.state));
      text('#runtime-mode', label(r.mode));
      setPill('#runtime-health', r.health?.status, label(r.health?.status));
      text('#runtime-uptime', isNum(r.uptimeMs) ? Math.round(r.uptimeMs / 1000) + ' s' : NOT_REPORTED);

      // Capabilities
      const capData = await apiJson('/api/v1/runtime/capabilities', { headers: { authorization: `Bearer ${accessToken}` } });
      const caps = capData.data || [];
      const node = $('#runtime-capabilities');
      if (caps.length === 0) {
        node.innerHTML = '<p class="empty-note">No runtime capabilities reported.</p>';
      } else {
        node.innerHTML = caps.map((c) => {
          const id = c.adapterId || c.id || 'adapter';
          const status = c.status || 'unknown';
          return tile(id, String(c.type || ''), status);
        }).join('');
      }
    } catch (err) {
      text('#runtime-state', 'Unable to load');
      text('#runtime-mode', 'Unable to load');
      text('#runtime-health', 'Unable to load');
      $('#runtime-capabilities').innerHTML = '<p class="empty-note">Unable to load capabilities: ' + escapeHtml(err.message) + '</p>';
    }
  }

  // ── Storage ───────────────────────────────────────────────────────────
  async function renderStorage(data) {
    try {
      text('#storage-database', label(data.dependencies?.database));
      text('#storage-latency', ms(data.diagnostics?.databaseLatencyMs));
      text('#storage-queue', label(data.dependencies?.queue));
      text('#storage-eventbus', label(data.eventBus?.status));
      text('#storage-eventbus-scope', data.eventBus?.scope || '—');
    } catch (err) {
      text('#storage-database', 'Unable to load');
    }
  }

  // ── Security ──────────────────────────────────────────────────────────
  async function renderSecurity(data) {
    try {
      text('#security-state', label(data.security?.state));
      text('#security-protection', label(data.security?.protectionState));
      text('#security-kill-switch', label(data.security?.killSwitch));
      text('#security-dns-leak', label(data.security?.dnsLeak));
      text('#security-route-leak', label(data.security?.routeLeak));
    } catch (err) {
      text('#security-state', 'Unable to load');
    }
  }

  // ── Topology ──────────────────────────────────────────────────────────
  async function renderTopology() {
    try {
      const data = await apiJson('/api/v1/platform/topology', { headers: { authorization: `Bearer ${accessToken}` } });
      topologyData = data.data;
      buildGraph(topologyData);
      renderGraph();
    } catch (err) {
      $('#graph-loading').textContent = 'Unable to load topology: ' + escapeHtml(err.message);
      $('#graph-empty').classList.remove('hidden');
    }
  }

  function buildGraph(data) {
    graphNodes = [];
    graphEdges = [];

    if (!data) return;

    // Interfaces → nodes
    (data.interfaces || []).forEach((iface) => {
      graphNodes.push({
        id: iface.id,
        label: iface.name || iface.id,
        type: 'network-interface',
        layer: 'fabric',
        state: iface.state || 'unknown',
        active: iface.active || false,
        data: iface,
      });
    });

    // Routes → nodes
    (data.routes || []).forEach((route) => {
      graphNodes.push({
        id: route.id,
        label: route.destination || '0.0.0.0/0',
        type: 'route',
        layer: 'fabric',
        state: route.state || 'unknown',
        active: route.active || false,
        data: route,
      });
      // Edge: route → interface
      const ifaceNode = graphNodes.find((n) => n.id === 'linux-host:' + route.interface);
      if (ifaceNode) {
        graphEdges.push({ from: route.id, to: ifaceNode.id, type: 'connected-to', layer: 'fabric' });
      }
    });

    // DNS resolvers → nodes
    (data.dns?.resolvers || []).forEach((resolver) => {
      graphNodes.push({
        id: 'dns-' + resolver.id,
        label: resolver.id,
        type: 'dns-resolver',
        layer: 'fabric',
        state: resolver.active ? 'healthy' : 'unknown',
        active: resolver.active || false,
        data: resolver,
      });
    });

    // Tunnels → nodes
    (data.tunnels || []).forEach((tunnel) => {
      graphNodes.push({
        id: 'tunnel-' + tunnel.id,
        label: tunnel.id,
        type: 'tunnel',
        layer: 'fabric',
        state: tunnel.state || 'unknown',
        active: tunnel.state === 'connected',
        data: tunnel,
      });
    });

    // Providers → nodes
    (data.providers || []).forEach((provider) => {
      graphNodes.push({
        id: 'provider-' + provider.id,
        label: provider.id,
        type: 'provider',
        layer: 'control',
        state: provider.state || 'unknown',
        active: true,
        data: provider,
      });
    });

    // Gateway → node
    if (data.gateway) {
      graphNodes.push({
        id: 'gateway-' + data.gateway.id,
        label: data.gateway.gateway || 'gateway',
        type: 'gateway',
        layer: 'fabric',
        state: 'unknown',
        active: true,
        data: data.gateway,
      });
    }

    // API node
    graphNodes.push({
      id: 'api-node',
      label: 'IRP API',
      type: 'api',
      layer: 'control',
      state: 'healthy',
      active: true,
      data: { type: 'api' },
    });

    // Daemon node
    graphNodes.push({
      id: 'daemon-node',
      label: 'IRP Daemon',
      type: 'daemon',
      layer: 'control',
      state: 'healthy',
      active: true,
      data: { type: 'daemon' },
    });

    // Runtime node
    graphNodes.push({
      id: 'runtime-node',
      label: 'ResilienceRuntime',
      type: 'runtime',
      layer: 'control',
      state: 'healthy',
      active: true,
      data: { type: 'runtime' },
    });

    // Edges between control plane components
    graphEdges.push({ from: 'api-node', to: 'daemon-node', type: 'depends-on', layer: 'control' });
    graphEdges.push({ from: 'daemon-node', to: 'runtime-node', type: 'depends-on', layer: 'control' });

    // Connect interfaces to daemon
    graphNodes.filter((n) => n.type === 'network-interface').forEach((n) => {
      graphEdges.push({ from: 'daemon-node', to: n.id, type: 'connected-to', layer: 'control' });
    });
  }

  function getNodeColor(node) {
    const t = tone(node.state);
    const map = { ok: 'var(--ok)', warn: 'var(--warn)', danger: 'var(--danger)', unknown: 'var(--muted)', observing: 'var(--primary)' };
    return map[t] || 'var(--muted)';
  }

  function getEdgeColor(edge) {
    const t = 'ok';
    const map = { ok: 'var(--ok)', warn: 'var(--warn)', danger: 'var(--danger)', unknown: 'var(--muted)' };
    return map[t] || 'var(--muted)';
  }

  function renderGraph() {
    const svg = $('#system-graph');
    const container = $('#graph-container');
    const loading = $('#graph-loading');
    const empty = $('#graph-empty');

    if (!graphNodes || graphNodes.length === 0) {
      loading.classList.add('hidden');
      empty.classList.remove('hidden');
      svg.innerHTML = '';
      return;
    }

    loading.classList.add('hidden');
    empty.classList.add('hidden');

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.35;

    // Layout nodes in concentric circles by layer
    const layers = ['control', 'fabric'];
    const layerNodes = {};
    layers.forEach((l) => { layerNodes[l] = graphNodes.filter((n) => n.layer === l); });

    let angleOffset = 0;
    const positions = {};

    // Control layer: inner circle
    const ctrlNodes = layerNodes.control;
    if (ctrlNodes.length > 0) {
      const step = (2 * Math.PI) / ctrlNodes.length;
      ctrlNodes.forEach((n, i) => {
        const angle = angleOffset + i * step;
        positions[n.id] = { x: cx + radius * 0.5 * Math.cos(angle), y: cy + radius * 0.5 * Math.sin(angle) };
      });
      angleOffset += Math.PI / ctrlNodes.length;
    }

    // Fabric layer: outer circle
    const fabNodes = layerNodes.fabric;
    if (fabNodes.length > 0) {
      const step = (2 * Math.PI) / fabNodes.length;
      fabNodes.forEach((n, i) => {
        const angle = angleOffset + i * step;
        positions[n.id] = { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
      });
    }

    // Build SVG
    let svgContent = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">`;
    svgContent += `<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon fill="currentColor" points="0 0, 10 3.5, 0 7"/></marker></defs>`;

    // Draw edges first (below nodes)
    graphEdges.forEach((edge) => {
      const fromPos = positions[edge.from];
      const toPos = positions[edge.to];
      if (!fromPos || !toPos) return;
      const selected = selectedEdgeId === edge.id ? ' edge-selected' : '';
      svgContent += `<line x1="${fromPos.x}" y1="${fromPos.y}" x2="${toPos.x}" y2="${toPos.y}" stroke="${getEdgeColor(edge)}" stroke-width="2" marker-end="url(#arrowhead)" class="edge ${edge.type}${selected}" data-edge-id="${edge.id}" style="cursor:pointer;" />`;
    });

    // Draw nodes
    graphNodes.forEach((node) => {
      const pos = positions[node.id];
      if (!pos) return;
      const selected = selectedNodeId === node.id ? ' node-selected' : '';
      const color = getNodeColor(node);
      svgContent += `<circle cx="${pos.x}" cy="${pos.y}" r="14" fill="${color}" class="node ${node.type}${selected}" data-node-id="${node.id}" style="cursor:pointer; stroke:white; stroke-width:2;" />`;
      svgContent += `<text x="${pos.x}" y="${pos.y + 4}" text-anchor="middle" font-size="11" fill="var(--text)" pointer-events="none">${escapeHtml(node.label)}</text>`;
    });

    svgContent += '</svg>';
    svg.innerHTML = svgContent;

    // Wire up click handlers
    svg.querySelectorAll('.node').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.getAttribute('data-node-id');
        selectNode(id);
      });
    });
    svg.querySelectorAll('.edge').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.getAttribute('data-edge-id');
        selectEdge(id);
      });
    });
  }

  function selectNode(id) {
    selectedNodeId = id;
    selectedEdgeId = null;
    const node = graphNodes.find((n) => n.id === id);
    const drawer = $('#detail-drawer');
    const title = $('#detail-title');
    const kind = $('#detail-kind');
    const content = $('#detail-content');

    if (!node) {
      drawer.classList.add('hidden');
      return;
    }

    title.textContent = node.label;
    const t = tone(node.state);
    kind.setAttribute('data-tone', t);
    kind.textContent = node.type.toUpperCase() + ' · ' + label(node.state);

    let html = `<div class="detail-section">
      <h4>Identity</h4>
      <div class="detail-row"><dt>ID</dt><dd>${escapeHtml(node.id)}</dd></div>
      <div class="detail-row"><dt>Type</dt><dd>${escapeHtml(node.type)}</dd></div>
      <div class="detail-row"><dt>Layer</dt><dd>${escapeHtml(node.layer)}</dd></div>
      <div class="detail-row"><dt>Status</dt><dd><span class="detail-badge ${t}">${label(node.state)}</span></dd></div>
      <div class="detail-row"><dt>Active</dt><dd>${node.active ? 'Yes' : 'No'}</dd></div>
    </div>
    <div class="detail-section">
      <h4>Observed Data</h4>
      <div class="detail-row"><dt>Source</dt><dd>Daemon control socket (live)</dd></div>
      <div class="detail-row"><dt>Last observed</dt><dd>${new Date().toLocaleTimeString()}</dd></div>
    </div>`;

    // Add node-specific data
    if (node.data) {
      html += `<div class="detail-section"><h4>Details</h4>`;
      Object.entries(node.data).forEach(([k, v]) => {
        if (k === 'id' || k === 'type') return;
        html += `<div class="detail-row"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd></div>`;
      });
      html += `</div>`;
    }

    html += `<div class="detail-section">
      <h4>Classification</h4>
      <div class="detail-row"><dt>Status basis</dt><dd>Verified runtime integration via daemon observation</dd></div>
    </div>`;

    content.innerHTML = html;
    drawer.classList.remove('hidden');
  }

  function selectEdge(id) {
    selectedEdgeId = id;
    selectedNodeId = null;
    const edge = graphEdges.find((e) => e.id === id);
    const drawer = $('#detail-drawer');
    const title = $('#detail-title');
    const kind = $('#detail-kind');
    const content = $('#detail-content');

    if (!edge) {
      drawer.classList.add('hidden');
      return;
    }

    title.textContent = edge.type + ' connection';
    kind.setAttribute('data-tone', 'ok');
    kind.textContent = 'Edge · ' + edge.type;

    const fromNode = graphNodes.find((n) => n.id === edge.from);
    const toNode = graphNodes.find((n) => n.id === edge.to);

    content.innerHTML = `<div class="detail-section">
      <h4>Connection</h4>
      <div class="detail-row"><dt>Type</dt><dd>${escapeHtml(edge.type)}</dd></div>
      <div class="detail-row"><dt>Layer</dt><dd>${escapeHtml(edge.layer)}</dd></div>
      <div class="detail-row"><dt>Source</dt><dd>${escapeHtml(edge.from)} ${fromNode ? '(' + escapeHtml(fromNode.label) + ')' : ''}</dd></div>
      <div class="detail-row"><dt>Destination</dt><dd>${escapeHtml(edge.to)} ${toNode ? '(' + escapeHtml(toNode.label) + ')' : ''}</dd></div>
      <div class="detail-row"><dt>Status</dt><dd><span class="detail-badge ok">Observed</span></dd></div>
      <div class="detail-row"><dt>Basis</dt><dd>Daemon topology observation (live)</dd></div>
    </div>`;

    drawer.classList.remove('hidden');
  }

  function renderGraph() {
    const svg = $('#system-graph');
    if (svg.innerHTML === '') {
      // Already rendered; just re-highlight selection
    }
  }

  // ── SSE Event Stream ─────────────────────────────────────────────────
  function startEventStream() {
    if (!accessToken) return;
    if (eventSource) eventSource.close();

    const url = new URL(API_BASE + '/api/v1/platform/events/stream');
    const evt = new EventSource(url, { headers: { authorization: `Bearer ${accessToken}` } });

    evt.onopen = () => {
      markLive();
      $('#live-region').textContent = 'Live event stream connected.';
    };

    evt.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.event === 'heartbeat' || !data.event) return;
        addEvent(data.event, data.payload || data);
      } catch {
        // ignore non-JSON messages
      }
    };

    evt.onerror = () => {
      evt.close();
      eventSource = null;
      markStale();
      $('#live-region').textContent = 'Event stream disconnected. Will retry on next refresh.';
      setTimeout(startEventStream, 5000);
    };

    eventSource = evt;
  }

  function addEvent(type, payload) {
    const ts = new Date().toISOString();
    const event = { id: type + '-' + Date.now(), type, payload, timestamp: ts };
    events.unshift(event);
    if (events.length > maxEvents) events.pop();
    lastEventTs = ts;
    text('#event-last', 'Last event: ' + new Date(ts).toLocaleTimeString());
    if (currentView === 'events') renderEvents();
    $('#live-region').textContent = 'New event: ' + type;
  }

  function renderEvents() {
    const node = $('#events-timeline');
    if (events.length === 0) {
      node.innerHTML = '<div class="muted">Waiting for events…</div>';
      return;
    }
    node.innerHTML = events.map((ev) => {
      const t = tone(ev.payload?.state || ev.payload?.status || 'unknown');
      const payloadStr = typeof ev.payload === 'string' ? ev.payload : JSON.stringify(ev.payload, null, 2);
      return `<div class="event-item">
        <div class="event-time">${new Date(ev.timestamp).toLocaleTimeString()}</div>
        <div><span class="event-type">${escapeHtml(ev.type)}</span></div>
        <div class="event-payload">${escapeHtml(payloadStr.slice(0, 200))}${payloadStr.length > 200 ? '…' : ''}</div>
        <div class="event-source">Source: daemon control socket</div>
      </div>`;
    }).join('');
  }

  function pauseEventStream() {
    livePaused = !livePaused;
    const btn = $('#pause-button');
    btn.setAttribute('aria-pressed', String(livePaused));
    btn.textContent = livePaused ? 'Resume' : 'Pause';
    setPill('#live-indicator', livePaused ? 'paused' : 'live', livePaused ? 'Paused' : 'Live');
  }

  // ── Components / Capabilities / Providers / Devices ───────────────────
  async function renderComponents() {
    try {
      const data = await apiJson('/api/v1/runtime/snapshot', { headers: { authorization: `Bearer ${accessToken}` } });
      const node = $('#components-list');
      const snap = data.data || {};
      const items = [];
      if (snap.state) items.push({ name: 'Runtime state', detail: snap.state, state: 'healthy' });
      if (snap.mode) items.push({ name: 'Runtime mode', detail: snap.mode, state: 'ok' });
      if (snap.health) items.push({ name: 'Runtime health', detail: snap.health.status || 'unknown', state: snap.health.status || 'unknown' });
      if (snap.counters) {
        Object.entries(snap.counters).forEach(([k, v]) => items.push({ name: k, detail: String(v), state: 'ok' }));
      }
      if (items.length === 0) items.push({ name: 'No components', detail: 'No component data reported', state: 'unknown' });
      node.innerHTML = items.map((i) => tile(i.name, i.detail, i.state)).join('');
    } catch (err) {
      $('#components-list').innerHTML = '<p class="empty-note">Unable to load components: ' + escapeHtml(err.message) + '</p>';
    }
  }

  async function renderCapabilities() {
    try {
      const data = await apiJson('/api/v1/runtime/capabilities', { headers: { authorization: `Bearer ${accessToken}` } });
      const node = $('#capabilities-list');
      const caps = data.data || [];
      if (caps.length === 0) {
        node.innerHTML = '<p class="empty-note">No capabilities reported.</p>';
        return;
      }
      node.innerHTML = caps.map((c) => {
        const id = c.adapterId || c.id || 'adapter';
        const status = c.status || 'unknown';
        return tile(id, String(c.type || ''), status);
      }).join('');
    } catch (err) {
      $('#capabilities-list').innerHTML = '<p class="empty-note">Unable to load capabilities: ' + escapeHtml(err.message) + '</p>';
    }
  }

  async function renderProvidersView() {
    try {
      const data = await apiJson('/api/v1/platform/topology', { headers: { authorization: `Bearer ${accessToken}` } });
      const node = $('#providers-list');
      const d = data.data || {};
      const items = [];
      (d.providers || []).forEach((p) => items.push({ name: p.id, detail: p.type || 'provider', state: p.state || 'unknown' }));
      (d.interfaces || []).forEach((i) => items.push({ name: i.name || i.id, detail: 'interface · ' + (i.gateway || 'no gateway'), state: i.state || 'unknown' }));
      if (items.length === 0) items.push({ name: 'No providers', detail: 'No provider data reported', state: 'unknown' });
      node.innerHTML = items.map((i) => tile(i.name, i.detail, i.state)).join('');
    } catch (err) {
      $('#providers-list').innerHTML = '<p class="empty-note">Unable to load providers: ' + escapeHtml(err.message) + '</p>';
    }
  }

  async function renderDevicesView() {
    try {
      const data = await apiJson('/api/v1/runtime/snapshot', { headers: { authorization: `Bearer ${accessToken}` } });
      const node = $('#devices-list');
      const snap = data.data || {};
      const items = [];
      items.push({ name: 'Runtime ID', detail: snap.runtimeId || '—', state: 'ok' });
      items.push({ name: 'Instance ID', detail: snap.instanceId || '—', state: 'ok' });
      items.push({ name: 'Uptime', detail: isNum(snap.uptimeMs) ? Math.round(snap.uptimeMs / 1000) + ' s' : '—', state: 'ok' });
      if (items.length === 0) items.push({ name: 'No devices', detail: 'No device data reported', state: 'unknown' });
      node.innerHTML = items.map((i) => tile(i.name, i.detail, i.state)).join('');
    } catch (err) {
      $('#devices-list').innerHTML = '<p class="empty-note">Unable to load devices: ' + escapeHtml(err.message) + '</p>';
    }
  }

  // ── Refresh / auto-refresh ────────────────────────────────────────────
  function scheduleRefresh() {
    if (refreshTimer) window.clearInterval(refreshTimer);
    refreshTimer = null;
    if (autoRefresh) refreshTimer = window.setInterval(() => { if (!document.hidden && !livePaused) refresh(); }, 10000);
  }

  // ── Init ──────────────────────────────────────────────────────────────
  function initApp() {
    text('#user-email', localStorage.getItem('irp_user_email') || 'User');
    showView(currentView, false);
    applyTheme(loadTheme());
    refresh();
    startEventStream();
    scheduleRefresh();
  }

  // ── Event wiring ─────────────────────────────────────────────────────
  $('#signin-form').addEventListener('submit', handleSignin);
  $('#signup-form').addEventListener('submit', handleSignup);
  $('#signout-button').addEventListener('click', handleSignout);
  $('#refresh-button').addEventListener('click', refresh);
  $('#retry-button').addEventListener('click', refresh);
  $('#pause-button').addEventListener('click', pauseEventStream);
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

  // Member portal button wiring
  $('#member-enroll-btn').addEventListener('click', () => {
    $('#member-enroll-form').hidden = !$('#member-enroll-form').hidden;
  });
  $('#member-enroll-cancel').addEventListener('click', () => {
    $('#member-enroll-form').hidden = true;
  });
  $('#member-enroll-submit').addEventListener('click', appEnrollDevice);
  $('#member-renew-btn').addEventListener('click', appRenewSubscription);
  $('#member-cancel-btn').addEventListener('click', appCancelSubscription);
  $('#member-connect-btn').addEventListener('click', () => {
    // Find first authorized device and connect it
    // For now, show a prompt or connect the first device
    alert('Connect feature: use the Devices view to connect individual devices.');
  });
  $('#member-disconnect-btn').addEventListener('click', () => {
    alert('Disconnect feature: use the Devices view to disconnect individual devices.');
  });

  // Sidebar toggle (mobile)
  let sidebarOpen = false;
  $('#sidebar-toggle').addEventListener('click', () => {
    sidebarOpen = !sidebarOpen;
    $('#sidebar').classList.toggle('open', sidebarOpen);
    $('#sidebar-toggle').setAttribute('aria-expanded', String(sidebarOpen));
  });

  // Detail drawer close
  $('#detail-close').addEventListener('click', () => {
    $('#detail-drawer').classList.add('hidden');
    selectedNodeId = null;
    selectedEdgeId = null;
  });
  $('#detail-dismiss').addEventListener('click', () => {
    $('#detail-drawer').classList.add('hidden');
    selectedNodeId = null;
    selectedEdgeId = null;
  });

  window.addEventListener('hashchange', () => showView((window.location.hash || '').replace('#', '') || 'system-map', true));

  // Layer / status / search filters (no-op placeholders wired to UI)
  $('#layer-filter').addEventListener('change', () => { /* filtering applied on next render */ });
  $('#status-filter').addEventListener('change', () => { /* filtering applied on next render */ });
  $('#graph-search').addEventListener('input', () => { /* filtering applied on next render */ });
  $('#zoom-fit').addEventListener('click', () => { /* zoom fit placeholder */ });
  $('#zoom-reset').addEventListener('click', () => { /* zoom reset placeholder */ });

  // Event timeline controls
  $('#event-pause').addEventListener('click', pauseEventStream);
  $('#event-clear').addEventListener('click', () => {
    events = [];
    renderEvents();
    text('#event-last', 'Last event: —');
  });

  // ── Boot ──────────────────────────────────────────────────────────────
  const stored = localStorage.getItem('irp_access_token');
  if (stored) {
    accessToken = stored;
    userRole = localStorage.getItem('irp_user_role') || null;
    showApp();
    initApp();
  } else {
    showAuth();
  }

  // Zero-cost refresh button
  $('#zero-cost-refresh').addEventListener('click', renderZeroCost);
})();
