/**
 * IRP Control Center (web).
 *
 * Presentation only. The page reads the existing `GET /api/v1/platform/status` payload and the
 * existing readiness/metrics/docs links; it adds no endpoint, no mutation and no host control.
 * Visual tokens mirror docs/design/irp-design-tokens.json (enforced by design-tokens.test.ts).
 *
 * Everything shown is a field the API returned. A field that is absent is shown as "Not reported",
 * never defaulted to a healthy-looking value.
 */
export const dashboardHtml = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <meta name="theme-color" content="#0A0F1C">
  <meta name="description" content="Live network health and resilience control center">
  <title>IRP Control Center</title>
  <link rel="stylesheet" href="/assets/dashboard.css">
  <script defer src="/assets/dashboard.js"></script>
</head>
<body>
  <div id="auth-overlay" class="auth-overlay" hidden>
    <div class="auth-card">
      <div class="auth-tabs">
        <button class="auth-tab active" data-tab="signin">Sign in</button>
        <button class="auth-tab" data-tab="signup">Create account</button>
      </div>
      <form id="signin-form" class="auth-form">
        <div class="form-group"><label>Email</label><input id="signin-email" type="email" required placeholder="you@example.com"></div>
        <div class="form-group"><label>Password</label><input id="signin-password" type="password" required></div>
        <div class="form-actions"><button class="button button-primary" type="submit">Sign in</button></div>
        <p id="signin-message" class="form-message" hidden></p>
      </form>
      <form id="signup-form" class="auth-form" hidden>
        <div class="form-group"><label>Email</label><input id="signup-email" type="email" required placeholder="you@example.com"></div>
        <div class="form-group"><label>Name</label><input id="signup-name" type="text" required></div>
        <div class="form-group"><label>Password (min 12 chars)</label><input id="signup-password" type="password" required></div>
        <div class="form-actions"><button class="button button-primary" type="submit">Create account</button></div>
        <p id="signup-message" class="form-message" hidden></p>
      </form>
      <div class="auth-footer">
        <p id="auth-loading" class="muted small" hidden>Loading…</p>
        <button id="auth-close" class="button button-text">Close</button>
      </div>
    </div>
  </div>
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="app is-loading" id="app">
    <aside class="sidebar">
      <a class="brand" href="/" aria-label="Internet Resilience Platform home">
        <span class="brand-mark" aria-hidden="true">IR</span>
        <span class="brand-copy"><strong>Internet Resilience</strong><small>Control Center</small></span>
      </a>
      <nav class="nav" aria-label="Views">
        <a href="#overview" data-view="overview"><span class="nav-glyph" aria-hidden="true">◈</span>Overview</a>
        <a href="#connectivity" data-view="connectivity"><span class="nav-glyph" aria-hidden="true">⌁</span>Connectivity</a>
        <a href="#performance" data-view="performance"><span class="nav-glyph" aria-hidden="true">∿</span>Performance</a>
        <a href="#tunnel" data-view="tunnel"><span class="nav-glyph" aria-hidden="true">⇄</span>Tunnel</a>
        <a href="#security" data-view="security"><span class="nav-glyph" aria-hidden="true">⬡</span>Security</a>
        <a href="#automation" data-view="automation"><span class="nav-glyph" aria-hidden="true">◎</span>Automation</a>
        <a href="#diagnostics" data-view="diagnostics"><span class="nav-glyph" aria-hidden="true">▦</span>Diagnostics</a>
        <hr class="nav-divider">
        <nav class="member-nav" hidden>
          <a href="#member" data-view="member"><span class="nav-glyph" aria-hidden="true">👤</span>Member Portal</a>
          <a href="#plans" data-view="plans"><span class="nav-glyph" aria-hidden="true">💳</span>Subscription Plans</a>
          <a href="#member-devices" data-view="member-devices"><span class="nav-glyph" aria-hidden="true">📱</span>My Devices</a>
        </nav>
        <nav class="admin-nav" hidden>
          <a href="#admin" data-view="admin"><span class="nav-glyph" aria-hidden="true">⚙️</span>Super Admin Control Center</a>
          <a href="#components" data-view="components"><span class="nav-glyph" aria-hidden="true">🧩</span>Components</a>
          <a href="#capabilities" data-view="capabilities"><span class="nav-glyph" aria-hidden="true">🔌</span>Capabilities</a>
          <a href="#providers" data-view="providers"><span class="nav-glyph" aria-hidden="true">📡</span>Providers</a>
          <a href="#decisions" data-view="decisions"><span class="nav-glyph" aria-hidden="true">📋</span>Decisions</a>
          <a href="#incidents" data-view="incidents"><span class="nav-glyph" aria-hidden="true">🚨</span>Incidents</a>
          <a href="#events" data-view="events"><span class="nav-glyph" aria-hidden="true">📢</span>Events</a>
          <a href="#storage" data-view="storage"><span class="nav-glyph" aria-hidden="true">💾</span>Storage</a>
          <a href="#security" data-view="security"><span class="nav-glyph" aria-hidden="true">🛡️</span>Security</a>
        </nav>
      </nav>
      <p class="sidebar-note">Read-only view of live API data. It never changes host networking.</p>
    </aside>

    <div class="content">
      <header class="topbar">
        <div class="topbar-title">
          <p class="eyebrow" id="view-eyebrow">Live operations</p>
          <h1 id="view-title">Overview</h1>
        </div>
        <div class="topbar-actions">
          <span id="global-status" class="pill" data-tone="unknown"><span class="pill-glyph" aria-hidden="true">○</span><span class="pill-text">Connecting</span></span>
          <button id="refresh-button" class="button" type="button">Refresh</button>
          <button id="auto-button" class="button" type="button" aria-pressed="true">Auto refresh: on</button>
          <button id="theme-button" class="button" type="button" aria-label="Colour theme: automatic. Activate to change.">Theme: auto</button>
          <button id="logout-button" class="button button-text" style="display:none" type="button">Sign out</button>
        </div>
      </header>

      <div id="error-banner" class="banner banner-danger" role="alert" hidden>
        <p id="error-message"></p>
        <button id="retry-button" class="button" type="button">Retry</button>
      </div>
      <p id="stale-note" class="banner banner-warn" hidden></p>
      <div id="live-region" class="sr-only" role="status" aria-live="polite"></div>

      <main id="main" tabindex="-1">
        <section class="view" id="view-overview" data-view="overview" aria-labelledby="view-title">
          <div class="kpi-grid">
            <article class="card kpi kpi-primary">
              <p class="kpi-label">Network health score</p>
              <p class="kpi-value"><span id="health-score">—</span><small>/ 100</small></p>
              <p class="kpi-foot" id="health-caption">Awaiting measurements</p>
            </article>
            <article class="card kpi">
              <p class="kpi-label">Connection</p>
              <p class="kpi-value kpi-word" id="connection-state">—</p>
              <p class="kpi-foot" id="route-caption">Route not reported</p>
            </article>
            <article class="card kpi">
              <p class="kpi-label">DNS latency</p>
              <p class="kpi-value"><span id="dns-latency">—</span><small>ms</small></p>
              <p class="kpi-foot" id="dns-caption">Resolver status pending</p>
            </article>
            <article class="card kpi">
              <p class="kpi-label">Active incidents</p>
              <p class="kpi-value"><span id="incident-count">—</span></p>
              <p class="kpi-foot" id="approval-caption">Approvals pending: —</p>
            </article>
          </div>

          <div class="grid two">
            <article class="card">
              <header class="card-head"><div><p class="eyebrow">Decision engine</p><h2>Current recommendation</h2></div><span id="decision-chip" class="pill" data-tone="unknown"><span class="pill-glyph" aria-hidden="true">○</span><span class="pill-text">Waiting</span></span></header>
              <p id="decision-title" class="lead">Waiting for the first status snapshot…</p>
              <p id="decision-explanation" class="muted">The API recommendation appears here once data arrives.</p>
              <dl class="kv kv-inline">
                <div><dt>Confidence</dt><dd id="decision-confidence">—</dd></div>
                <div><dt>Mode</dt><dd id="decision-mode">—</dd></div>
                <div><dt>Policy</dt><dd id="policy-state">—</dd></div>
              </dl>
            </article>
            <article class="card">
              <header class="card-head"><div><p class="eyebrow">Platform</p><h2>Component health</h2></div></header>
              <div id="module-grid" class="module-grid" aria-live="off"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>
            </article>
          </div>

          <p class="meta-line"><span>Last updated: <strong id="last-updated">waiting for API…</strong></span><span id="source-label">Source: pending</span></p>
        </section>

        <section class="view" id="view-connectivity" data-view="connectivity" aria-label="Connectivity" hidden>
          <div class="grid two">
            <article class="card">
              <header class="card-head"><div><p class="eyebrow">Route</p><h2>Active path</h2></div><span id="network-health-chip" class="pill" data-tone="unknown"><span class="pill-glyph" aria-hidden="true">○</span><span class="pill-text">Waiting</span></span></header>
              <dl class="kv">
                <div><dt>Current route</dt><dd id="current-route">—</dd></div>
                <div><dt>Connection</dt><dd id="connection-detail">—</dd></div>
                <div><dt>Routing status</dt><dd id="routing-status">—</dd></div>
                <div><dt>Routing mode</dt><dd id="routing-mode">—</dd></div>
              </dl>
            </article>
            <article class="card">
              <header class="card-head"><div><p class="eyebrow">Name resolution</p><h2>DNS</h2></div><span id="dns-chip" class="pill" data-tone="unknown"><span class="pill-glyph" aria-hidden="true">○</span><span class="pill-text">Waiting</span></span></header>
              <dl class="kv">
                <div><dt>Resolver</dt><dd id="dns-resolver">—</dd></div>
                <div><dt>Latency</dt><dd id="dns-latency-detail">—</dd></div>
                <div><dt>Secure transport</dt><dd id="dns-secure">—</dd></div>
                <div><dt>Policy</dt><dd id="dns-policy">—</dd></div>
              </dl>
            </article>
          </div>
          <article class="card">
            <header class="card-head"><div><p class="eyebrow">Probes</p><h2>Interfaces</h2></div><span class="muted small" id="interface-count">—</span></header>
            <div id="interface-list" class="tile-grid"><div class="skeleton"></div><div class="skeleton"></div></div>
          </article>
        </section>

        <section class="view" id="view-performance" data-view="performance" aria-label="Performance" hidden>
          <article class="card">
            <header class="card-head"><div><p class="eyebrow">Health score</p><h2>Trend this session</h2></div><span class="muted small" id="history-count">0 samples</span></header>
            <div class="chart-wrap">
              <svg id="score-chart" viewBox="0 0 640 180" role="img" aria-label="Network health score over this browser session"></svg>
              <p id="chart-empty" class="empty-note">Collecting samples. A trend appears after the second refresh. History is kept in this page only and is not stored.</p>
            </div>
          </article>
          <div class="grid two">
            <article class="card">
              <header class="card-head"><div><p class="eyebrow">Latency</p><h2>Reported probes</h2></div></header>
              <div id="latency-bars" class="bars"><div class="skeleton"></div></div>
              <p class="muted small">Bars are relative to the slowest probe the API reported.</p>
            </article>
            <article class="card">
              <header class="card-head"><div><p class="eyebrow">Decision</p><h2>Probe candidates</h2></div></header>
              <div id="candidate-list" class="chips"><span class="muted">No probe data yet.</span></div>
              <dl class="kv">
                <div><dt>Decision age</dt><dd id="decision-age">—</dd></div>
                <div><dt>Database latency</dt><dd id="database-latency-metric">—</dd></div>
              </dl>
            </article>
          </div>
        </section>

        <section class="view" id="view-tunnel" data-view="tunnel" aria-label="Tunnel" hidden>
          <article class="card">
            <header class="card-head"><div><p class="eyebrow">Encrypted path</p><h2>Tunnel status</h2></div><span id="tunnel-chip" class="pill" data-tone="unknown"><span class="pill-glyph" aria-hidden="true">○</span><span class="pill-text">Waiting</span></span></header>
            <dl class="kv">
              <div><dt>Active tunnel</dt><dd id="tunnel-active">—</dd></div>
              <div><dt>Known tunnels</dt><dd id="tunnel-count">—</dd></div>
            </dl>
            <div id="tunnel-list" class="tile-grid"></div>
            <p id="tunnel-empty" class="empty-note" hidden>No tunnel is reported by this API instance. Tunnel lifecycle runs in the IRP clients; this page only displays what the platform status endpoint returns.</p>
          </article>
        </section>

        <section class="view" id="view-security" data-view="security" aria-label="Security" hidden>
          <article class="card">
            <header class="card-head"><div><p class="eyebrow">Protection posture</p><h2>Security</h2></div><span id="security-chip" class="pill" data-tone="unknown"><span class="pill-glyph" aria-hidden="true">○</span><span class="pill-text">Waiting</span></span></header>
            <dl class="kv">
              <div><dt>Security state</dt><dd id="security-state">—</dd></div>
              <div><dt>Protection mode</dt><dd id="protection-mode">—</dd></div>
              <div><dt>Kill switch</dt><dd id="kill-switch">—</dd></div>
              <div><dt>DNS leak check</dt><dd id="dns-leak">—</dd></div>
              <div><dt>Route leak check</dt><dd id="route-leak">—</dd></div>
              <div><dt>IPv6</dt><dd id="ipv6-state">—</dd></div>
              <div><dt>Security validation</dt><dd id="security-validation">—</dd></div>
            </dl>
            <p class="note" id="security-explanation">Reflects the backend's reported posture. Observe-only means enforcement is not active.</p>
            <ul id="violation-list" class="list" hidden></ul>
          </article>
        </section>

        <section class="view" id="view-automation" data-view="automation" aria-label="Automation" hidden>
          <article class="card">
            <header class="card-head"><div><p class="eyebrow">Autopilot</p><h2>Automation state</h2></div><span id="autopilot-chip" class="pill" data-tone="unknown"><span class="pill-glyph" aria-hidden="true">○</span><span class="pill-text">Waiting</span></span></header>
            <p class="lead" id="autopilot-mode">—</p>
            <p class="muted" id="autopilot-enabled">State unavailable</p>
            <dl class="kv">
              <div><dt>Active actions</dt><dd id="active-actions">—</dd></div>
              <div><dt>Circuit breaker</dt><dd id="circuit-breaker">—</dd></div>
              <div><dt>Verification</dt><dd id="verification-state">—</dd></div>
              <div><dt>Rollback</dt><dd id="rollback-state">—</dd></div>
            </dl>
            <p class="eyebrow spaced">Recent outcomes</p>
            <div id="outcome-list" class="chips"><span class="muted">None reported.</span></div>
          </article>
        </section>

        <section class="view" id="view-diagnostics" data-view="diagnostics" aria-label="Diagnostics" hidden>
          <div class="grid two">
            <article class="card">
              <header class="card-head"><div><p class="eyebrow">Recovery</p><h2>Issues</h2></div><span id="recovery-chip" class="pill" data-tone="unknown"><span class="pill-glyph" aria-hidden="true">○</span><span class="pill-text">Waiting</span></span></header>
              <p class="kpi-value"><span id="issue-count">—</span><small>reported issues</small></p>
              <ul id="issue-list" class="list"><li class="muted">Waiting for diagnostics…</li></ul>
            </article>
            <article class="card">
              <header class="card-head"><div><p class="eyebrow">Dependencies</p><h2>Service readiness</h2></div></header>
              <dl class="kv">
                <div><dt>Database</dt><dd id="database-state">—</dd></div>
                <div><dt>Database latency</dt><dd id="database-latency">—</dd></div>
                <div><dt>Queue</dt><dd id="queue-state">—</dd></div>
                <div><dt>Event bus</dt><dd id="eventbus-state">—</dd></div>
                <div><dt>Telemetry</dt><dd id="telemetry-state">—</dd></div>
                <div><dt>Telemetry exporter</dt><dd id="telemetry-exporter">—</dd></div>
              </dl>
            </article>
          </div>
          <article class="card">
            <header class="card-head"><div><p class="eyebrow">Developer tools</p><h2>API access</h2></div></header>
            <div class="link-grid">
              <a href="/docs" target="_blank" rel="noreferrer">Swagger API docs <span aria-hidden="true">↗</span></a>
              <a href="/api/v1/platform/status" target="_blank" rel="noreferrer">Live platform status <span aria-hidden="true">↗</span></a>
              <a href="/api/v1/ready" target="_blank" rel="noreferrer">Readiness probe <span aria-hidden="true">↗</span></a>
              <a href="/api/v1/metrics" target="_blank" rel="noreferrer">Prometheus metrics <span aria-hidden="true">↗</span></a>
            </div>
          </article>
          <details class="card raw-details">
            <summary>Raw platform status payload</summary>
            <pre id="raw-payload">No data loaded.</pre>
          </details>
        </section>

        <!-- Member Portal Views -->
        <section class="view" id="view-member" data-view="member" aria-label="Member Portal" hidden>
          <div class="card">
            <header class="card-head"><div><p class="eyebrow">My Subscription</p><h2>Subscription</h2></div></header>
            <div id="member-subscription"><div class="skeleton"></div><div class="skeleton"></div></div>
          </div>
          <div class="card">
            <header class="card-head"><div><p class="eyebrow">Available Plans</p><h2>Subscription Plans</h2></div></header>
            <div id="member-plans"><div class="skeleton"></div></div>
          </div>
          <div class="card">
            <header class="card-head"><div><p class="eyebrow">Connection</p><h2>Connection Status</h2></div></header>
            <dl class="kv">
              <div><dt>Status</dt><dd id="member-conn-status">—</dd></div>
              <div><dt>Authorized</dt><dd id="member-conn-authorized">—</dd></div>
              <div><dt>Connection Quality</dt><dd id="member-conn-quality">—</dd></div>
              <div><dt>Last Connected</dt><dd id="member-conn-last-connected">—</dd></div>
            </dl>
            <div style="margin-top:16px">
              <button class="button" id="member-connect-btn" onclick="appConnectDevice('current-device')">Connect</button>
              <button class="button button-danger" id="member-disconnect-btn" onclick="appDisconnectDevice('current-device')" hidden>Disconnect</button>
            </div>
            <p class="muted small" id="member-conn-history">Connection history tracked by daemon.</p>
          </div>
        </section>

        <section class="view" id="view-plans" data-view="plans" aria-label="Subscription Plans" hidden>
          <div class="card">
            <header class="card-head"><div><p class="eyebrow">Available Plans</p><h2>Choose a Plan</h2></div></header>
            <div id="member-plans"><div class="skeleton"></div><div class="skeleton"></div></div>
          </div>
        </section>

        <section class="view" id="view-member-devices" data-view="member-devices" aria-label="My Devices" hidden>
          <div class="card">
            <header class="card-head"><div><p class="eyebrow">Device Management</p><h2>My Devices</h2></div></header>
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px">
              <input id="member-enroll-device-id" type="text" placeholder="Device ID" style="flex:1;padding:10px 12px;border:1px solid var(--border);border-radius:var(--control);background:var(--bg);color:var(--text)">
              <input id="member-enroll-label" type="text" placeholder="Label" style="flex:1;padding:10px 12px;border:1px solid var(--border);border-radius:var(--control);background:var(--bg);color:var(--text)">
              <input id="member-enroll-platform" type="text" placeholder="Platform (linux/macos/windows)" value="linux" style="flex:1;padding:10px 12px;border:1px solid var(--border);border-radius:var(--control);background:var(--bg);color:var(--text)">
              <button class="button button-primary" onclick="appEnrollDevice()">Enroll</button>
            </div>
            <div id="member-device-list"><div class="skeleton"></div></div>
          </div>
        </section>

        <!-- Admin Control Center Views -->
        <section class="view" id="view-admin" data-view="admin" aria-label="Super Admin Control Center" hidden>
          <div class="grid two">
            <article class="card">
              <header class="card-head"><div><p class="eyebrow">Components</p><h2>Runtime Components</h2></div></header>
              <div id="admin-components"><div class="skeleton"></div></div>
            </article>
            <article class="card">
              <header class="card-head"><div><p class="eyebrow">Capabilities</p><h2>Platform Capabilities</h2></div></header>
              <div id="admin-capabilities"><div class="skeleton"></div></div>
            </article>
            <article class="card">
              <header class="card-head"><div><p class="eyebrow">Providers</p><h2>Network Providers</h2></div></header>
              <div id="admin-providers"><div class="skeleton"></div></div>
            </article>
            <article class="card">
              <header class="card-head"><div><p class="eyebrow">Devices</p><h2>Enrolled Devices</h2></div></header>
              <div id="admin-devices"><div class="skeleton"></div></div>
            </article>
          </div>
        </section>

        <section class="view" id="view-components" data-view="components" aria-label="Components" hidden>
          <div class="card">
            <header class="card-head"><div><p class="eyebrow">Runtime Components</p><h2>Components & Integrations</h2></div></header>
            <div id="admin-components"><div class="skeleton"></div></div>
          </div>
        </section>

        <section class="view" id="view-capabilities" data-view="capabilities" aria-label="Capabilities" hidden>
          <div class="card">
            <header class="card-head"><div><p class="eyebrow">Platform Capabilities</p><h2>Capability Directory</h2></div></header>
            <div id="admin-capabilities"><div class="skeleton"></div></div>
          </div>
        </section>

        <section class="view" id="view-providers" data-view="providers" aria-label="Providers" hidden>
          <div class="card">
            <header class="card-head"><div><p class="eyebrow">Providers</p><h2>Providers & Plugins</h2></div></header>
            <div id="admin-providers"><div class="skeleton"></div></div>
          </div>
        </section>

        <section class="view" id="view-decisions" data-view="decisions" aria-label="Decisions" hidden>
          <div class="card">
            <header class="card-head"><div><p class="eyebrow">Decisions</p><h2>Decision History</h2></div></header>
            <div id="admin-decisions"><div class="skeleton"></div></div>
          </div>
        </section>

        <section class="view" id="view-incidents" data-view="incidents" aria-label="Incidents" hidden>
          <div class="card">
            <header class="card-head"><div><p class="eyebrow">Incidents</p><h2>Incidents & Recovery</h2></div></header>
            <ul id="admin-incidents" class="list"><li class="muted">Loading incidents…</li></ul>
          </div>
        </section>

        <section class="view" id="view-events" data-view="events" aria-label="Events" hidden>
          <div class="card">
            <header class="card-head"><div><p class="eyebrow">Events</p><h2>Event Timeline</h2></div></header>
            <div id="admin-events"><div class="muted">Connecting to event stream…</div></div>
          </div>
        </section>

        <section class="view" id="view-storage" data-view="storage" aria-label="Storage" hidden>
          <div class="card">
            <header class="card-head"><div><p class="eyebrow">Storage</p><h2>Storage & Service Health</h2></div></header>
            <dl class="kv">
              <div><dt>Database</dt><dd id="admin-storage-db">—</dd></div>
              <div><dt>Database Latency</dt><dd id="admin-storage-latency">—</dd></div>
              <div><dt>Queue</dt><dd id="admin-storage-queue">—</dd></div>
              <div><dt>Event Bus</dt><dd id="admin-storage-eventbus">—</dd></div>
              <div><dt>Telemetry</dt><dd id="admin-storage-telemetry">—</dd></div>
              <div><dt>Telemetry Exporter</dt><dd id="admin-storage-exporter">—</dd></div>
            </dl>
          </div>
        </section>
      </main>

      <footer class="footer"><span>IRP Control Center</span><span>Live API data · Read-only dashboard · No host-network changes</span></footer>
    </div>
  </div>
</body>
</html>`;

export const dashboardCss = String.raw`
:root{color-scheme:dark;--bg:#0A0F1C;--surface:#111827;--surface-raised:#172033;--border:#2A3A55;--text:#E8EEF9;--muted:#9AA9C0;--primary:#6AA9FF;--accent:#4FD1C5;--ok:#4ADE9A;--warn:#F5C26B;--danger:#FF7A85;--radius:16px;--control:10px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
@media (prefers-color-scheme:light){:root:not([data-theme="dark"]){color-scheme:light;--bg:#F4F7FB;--surface:#FFFFFF;--surface-raised:#EEF3F9;--border:#C9D6E6;--text:#0F1B2D;--muted:#4A5B73;--primary:#1D5FD0;--accent:#0B7A75;--ok:#0A7F4F;--warn:#8A5A00;--danger:#B42335}}
:root[data-theme="light"]{color-scheme:light;--bg:#F4F7FB;--surface:#FFFFFF;--surface-raised:#EEF3F9;--border:#C9D6E6;--text:#0F1B2D;--muted:#4A5B73;--primary:#1D5FD0;--accent:#0B7A75;--ok:#0A7F4F;--warn:#8A5A00;--danger:#B42335}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);min-width:320px;font-size:15px;line-height:1.5}
button,a{font:inherit}
h1,h2,p,dl,dd,ul{margin:0}
.sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.skip-link{position:absolute;left:12px;top:-60px;z-index:20;background:var(--primary);color:var(--bg);padding:10px 14px;border-radius:var(--control);font-weight:600;text-decoration:none}
.skip-link:focus{top:12px}
:focus-visible{outline:3px solid var(--primary);outline-offset:2px;border-radius:6px}
#main:focus{outline:none}
.app{display:grid;grid-template-columns:248px minmax(0,1fr);min-height:100vh}
.sidebar{position:sticky;top:0;align-self:start;height:100vh;display:flex;flex-direction:column;gap:24px;padding:24px 16px;border-right:1px solid var(--border);background:var(--surface)}
.brand{display:flex;align-items:center;gap:12px;color:var(--text);text-decoration:none;padding:0 8px}
.brand-mark{width:40px;height:40px;display:grid;place-items:center;border-radius:12px;background:var(--primary);color:var(--bg);font-weight:800;letter-spacing:-1px}
.brand-copy{display:grid;line-height:1.25}
.brand-copy strong{font-size:14px}
.brand-copy small{color:var(--muted);font-size:12px}
.nav{display:grid;gap:4px}
.nav a{display:flex;align-items:center;gap:12px;min-height:44px;padding:0 12px;border-radius:var(--control);color:var(--muted);text-decoration:none;font-weight:500}
.nav a:hover{background:var(--surface-raised);color:var(--text)}
.nav a[aria-current="page"]{background:var(--surface-raised);color:var(--text);box-shadow:inset 3px 0 0 var(--primary)}
.nav-glyph{width:20px;text-align:center;color:var(--primary)}
.sidebar-note{margin-top:auto;color:var(--muted);font-size:12px;line-height:1.5;padding:0 8px}
.content{padding:0 32px;min-width:0;display:flex;flex-direction:column}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:24px 0 16px;flex-wrap:wrap}
.eyebrow{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--primary);font-weight:700;margin-bottom:4px}
.eyebrow.spaced{margin-top:24px}
h1{font-size:28px;line-height:1.15;letter-spacing:-.02em}
h2{font-size:17px;letter-spacing:-.01em;font-weight:650}
.topbar-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pill{display:inline-flex;align-items:center;gap:8px;min-height:32px;padding:0 12px;border:1px solid var(--border);border-radius:999px;font-size:13px;font-weight:600;white-space:nowrap;background:var(--surface)}
.pill[data-tone="ok"]{color:var(--ok)}
.pill[data-tone="warn"]{color:var(--warn)}
.pill[data-tone="danger"]{color:var(--danger)}
.pill[data-tone="observing"]{color:var(--primary)}
.pill[data-tone="unknown"]{color:var(--muted)}
.button{min-height:40px;padding:0 16px;border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:var(--control);font-size:13px;font-weight:600;cursor:pointer;transition:background .15s,border-color .15s}
.button:hover:not(:disabled){background:var(--surface-raised);border-color:var(--primary)}
.button:disabled{opacity:.6;cursor:progress}
.button[aria-pressed="true"]{border-color:var(--accent);color:var(--accent)}
.banner{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 16px;border-radius:var(--control);border:1px solid var(--border);margin-bottom:16px;font-size:14px}
.banner[hidden]{display:none}
.banner-danger{border-color:var(--danger);color:var(--danger);background:var(--surface)}
.banner-warn{border-color:var(--warn);color:var(--warn);background:var(--surface)}
main{flex:1;padding-bottom:24px}
.view[hidden]{display:none}
.view{display:grid;gap:16px;animation:fade .18s ease-out}
@keyframes fade{from{opacity:0}to{opacity:1}}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;min-width:0}
.card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px}
.grid.two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.kpi-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.kpi{padding:20px}
.kpi-primary{background:var(--surface-raised);border-color:var(--primary)}
.kpi-label{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:600}
.kpi-value{display:flex;align-items:baseline;gap:8px;margin:12px 0 8px;font-size:34px;line-height:1;font-weight:700;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.kpi-value small{font-size:13px;font-weight:500;letter-spacing:0;color:var(--muted)}
.kpi-word{font-size:24px;letter-spacing:-.02em}
.kpi-foot{color:var(--muted);font-size:13px}
.lead{font-size:20px;font-weight:650;letter-spacing:-.01em;margin-bottom:8px}
.muted{color:var(--muted)}
.small{font-size:13px}
.note{color:var(--muted);font-size:13px;margin-top:16px;padding-top:12px;border-top:1px solid var(--border)}
.kv{display:grid;margin-top:8px}
.kv>div{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:12px 0;border-bottom:1px solid var(--border)}
.kv>div:last-child{border-bottom:0}
.kv dt{color:var(--muted);font-size:14px}
.kv dd{font-weight:600;text-align:right;overflow-wrap:anywhere;font-size:14px}
.kv-inline{grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:16px;border-top:1px solid var(--border);padding-top:12px}
.kv-inline>div{display:grid;gap:4px;border:0;padding:0}
.kv-inline dd{text-align:left}
.module-grid,.tile-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.tile{background:var(--surface-raised);border:1px solid var(--border);border-radius:12px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:12px;min-width:0}
.tile>div{min-width:0}
.tile strong{font-size:14px;display:block;overflow-wrap:break-word}
.tile small{display:block;color:var(--muted);font-size:12px;margin-top:2px;overflow-wrap:anywhere}
.tone{font-size:12px;font-weight:700;white-space:nowrap;flex-shrink:0}
.tone[data-tone="ok"]{color:var(--ok)}
.tone[data-tone="warn"]{color:var(--warn)}
.tone[data-tone="danger"]{color:var(--danger)}
.tone[data-tone="observing"]{color:var(--primary)}
.tone[data-tone="unknown"]{color:var(--muted)}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}
.chip{font-size:13px;padding:6px 10px;border-radius:8px;background:var(--surface-raised);border:1px solid var(--border);color:var(--text)}
.chip[data-tone="warn"]{border-color:var(--warn);color:var(--warn)}
.chip[data-tone="ok"]{border-color:var(--ok);color:var(--ok)}
.list{list-style:none;padding:0;display:grid;gap:8px;margin-top:12px}
.list li{padding:10px 12px;border:1px solid var(--border);border-radius:var(--control);background:var(--surface-raised);font-size:14px}
.list li[data-tone="ok"]{border-color:var(--ok);color:var(--ok)}
.list li[data-tone="warn"]{border-color:var(--warn)}
.empty-note{color:var(--muted);font-size:14px;padding:16px;border:1px dashed var(--border);border-radius:var(--control);margin-top:12px}
.empty-note[hidden]{display:none}
.chart-wrap{position:relative}
.chart-wrap svg{width:100%;height:auto;display:block}
.chart-wrap svg:empty{display:none}
.chart-grid{stroke:var(--border);stroke-width:1;stroke-dasharray:3 6}
.chart-line{fill:none;stroke:var(--accent);stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
.chart-area{fill:var(--accent);opacity:.14}
.chart-point{fill:var(--accent);stroke:var(--surface);stroke-width:3}
.chart-label{fill:var(--muted);font-size:11px}
.bars{display:grid;gap:12px;margin-bottom:16px}
.bar-row{display:grid;gap:6px}
.bar-meta{display:flex;justify-content:space-between;font-size:14px}
.bar-meta span:last-child{font-weight:600;font-variant-numeric:tabular-nums}
.bar-track{display:block;height:8px;width:100%}
.bar-bg{fill:var(--surface-raised)}
.bar-fg{fill:var(--primary)}
.link-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.link-grid a{display:flex;justify-content:space-between;align-items:center;min-height:48px;padding:0 14px;border:1px solid var(--border);background:var(--surface-raised);border-radius:var(--control);color:var(--text);text-decoration:none;font-weight:500}
.link-grid a:hover{border-color:var(--primary)}
.raw-details summary{cursor:pointer;font-weight:600;min-height:24px}
.raw-details pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:420px;overflow:auto;color:var(--muted);font-size:12px;line-height:1.6;margin:12px 0 0}
.meta-line{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;color:var(--muted);font-size:13px}
.skeleton{height:48px;border-radius:12px;background:var(--surface-raised);animation:pulse 1.4s ease-in-out infinite}
@keyframes pulse{50%{opacity:.5}}
.is-loading .kpi-value span,.is-loading .kpi-word{color:var(--muted)}
.footer{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:16px 0 24px;border-top:1px solid var(--border);color:var(--muted);font-size:12px}
@media (prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}}
@media (max-width:1100px){.kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:960px){
  .app{grid-template-columns:1fr}
  .sidebar{position:sticky;top:0;z-index:10;height:auto;flex-direction:row;align-items:center;gap:12px;padding:8px 16px;border-right:0;border-bottom:1px solid var(--border);overflow-x:auto}
  .brand-copy,.sidebar-note{display:none}
  .nav{display:flex;gap:4px}
  .nav a{white-space:nowrap;min-height:44px}
  .content{padding:0 16px}
  .grid.two{grid-template-columns:1fr}
}
@media (max-width:560px){
  h1{font-size:24px}
  .kpi-grid,.link-grid{grid-template-columns:1fr}
  .kv-inline{grid-template-columns:1fr}
  .topbar-actions .button{flex:1 1 auto}
  .card{padding:16px}
}
/* Auth overlay */
.auth-overlay{position:fixed;inset:0;z-index:60;background:rgba(10,15,28,.85);display:flex;align-items:center;justify-content:center}
.auth-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:24px;min-width:320px;max-width:420px;width:90%}
.auth-tabs{display:flex;gap:8px;margin-bottom:16px}
.auth-tab{flex:1;padding:8px;border:1px solid var(--border);background:transparent;color:var(--text);border-radius:var(--control);cursor:pointer;font-size:13px;font-weight:600}
.auth-tab.active{border-color:var(--primary);color:var(--primary)}
.auth-form{display:flex;flex-direction:column;gap:12px;margin-bottom:16px}
.form-group{display:flex;flex-direction:column;gap:6px}
.form-group label{font-size:12px;color:var(--muted);font-weight:600}
.form-group input{padding:10px 12px;border:1px solid var(--border);border-radius:var(--control);background:var(--bg);color:var(--text);font-size:14px}
.form-actions{display:flex;gap:8px}
.form-message{color:var(--danger);font-size:13px;margin-top:8px}
.auth-footer{display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding-top:16px;border-top:1px solid var(--border)}
/* Member / Admin nav */
.nav-divider{margin:16px 0;border:none;border-top:1px solid var(--border)}
.member-nav,.admin-nav{display:flex;flex-direction:column;gap:4px}
.member-nav a,.admin-nav a{font-size:13px}
`;
export const dashboardScript = String.raw`
(function () {
  'use strict';
  var VIEWS = {
    overview: ['Live operations', 'Overview'],
    connectivity: ['Reachability', 'Connectivity'],
    performance: ['Measurements', 'Performance'],
    tunnel: ['Encrypted path', 'Tunnel'],
    security: ['Protection', 'Security'],
    automation: ['Resilience engine', 'Automation'],
    diagnostics: ['Health and support', 'Diagnostics'],
    member: ['Member Portal', 'Member Portal'],
    plans: ['Subscription Plans', 'Plans'],
    member-devices: ['My Devices', 'My Devices'],
    admin: ['Super Admin Control Center', 'Control Center'],
    components: ['Components', 'Components & Integrations'],
    capabilities: ['Capabilities', 'Platform Capabilities'],
    providers: ['Providers', 'Providers & Plugins'],
    decisions: ['Decisions', 'Decision History'],
    incidents: ['Incidents', 'Incidents & Recovery'],
    events: ['Events', 'Event Timeline'],
    storage: ['Storage', 'Storage & Service Health'],
    security: ['Security', 'Security & Authorization']
  };
  var THEMES = ['auto', 'light', 'dark'];
  var THEME_KEY = 'irp.dashboard.theme';
  var NOT_REPORTED = 'Not reported';
  var history = [];
  var autoRefresh = true;
  var refreshTimer = null;
  var lastGoodAt = null;
  var inFlight = false;
  var accessToken = null;
  var userRole = null;
  var userEmail = null;

  function $(selector) { return document.querySelector(selector); }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function isNum(value) { return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)); }

  function apiAuthHeaders() {
    var h = { 'accept': 'application/json', 'content-type': 'application/json' };
    if (accessToken) h.authorization = 'Bearer ' + accessToken;
    return h;
  }

  async function apiAuthRequest(path, init) {
    var headers = new Headers(init && init.headers || {});
    headers.set('accept', 'application/json');
    if (accessToken) headers.set('authorization', 'Bearer ' + accessToken);
    var opts = Object.assign({}, init, { headers: headers });
    return fetch(path, opts);
  }

  async function apiAuthJson(path, init) {
    var res = await apiAuthRequest(path, init);
    if (!res.ok) {
      var body = await res.json().catch(() => ({}));
      throw new Error(body.error && body.error.message ? body.error.message : 'Request failed: ' + res.status);
    }
    return res.json();
  }

  function showAuth() {
    $('#auth-overlay').classList.remove('hidden');
    $('#app-shell').classList.add('hidden');
    $('#signin-form').classList.remove('hidden');
    $('#signup-form').classList.add('hidden');
    $('#auth-loading').classList.add('hidden');
    $('#signin-message').classList.add('hidden');
    $('#signup-message').classList.add('hidden');
  }

  function showApp() {
    $('#auth-overlay').classList.add('hidden');
    $('#app-shell').classList.remove('hidden');
    var adminNav = $('#admin-nav');
    var memberNav = $('#member-nav');
    var logoutBtn = $('#logout-button');
    if (userRole === 'platform_admin') {
      adminNav.hidden = false;
      memberNav.hidden = true;
      if (!VIEWS[currentView || 'overview']) currentView = 'overview';
    } else {
      adminNav.hidden = true;
      memberNav.hidden = false;
      if (!VIEWS[currentView || 'overview']) currentView = 'member';
    }
    logoutBtn.style.display = accessToken ? 'inline-block' : 'none';
    text('#user-email', userEmail || '—');
  }

  function text(selector, value, fallback) {
    var node = $(selector);
    if (node) node.textContent = value == null || value === '' ? (fallback == null ? NOT_REPORTED : fallback) : String(value);
  }

  function label(value) {
    if (value == null || value === '') return NOT_REPORTED;
    var words = String(value).replace(/[-_]+/g, ' ').toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  /** Maps a backend state word to a tone. Neutral words never read as healthy. */
  function tone(value) {
    var status = String(value == null ? '' : value).toLowerCase();
    if (/unhealthy|unavailable|failed|error|down|critical|disconnected|open$/.test(status)) return 'danger';
    if (/degraded|partial|review|violation|warn/.test(status)) return 'warn';
    if (/observe|advisory/.test(status)) return 'observing';
    if (/healthy|available|passed|success|connected|^up$|closed|enabled|^ok$|noop|not.required/.test(status)) return 'ok';
    return 'unknown';
  }

  var GLYPH = { ok: '●', warn: '▲', danger: '■', observing: '◆', unknown: '○' };

  function setPill(selector, value, wording) {
    var node = $(selector);
    if (!node) return;
    var t = tone(value);
    node.setAttribute('data-tone', t);
    node.innerHTML = '<span class="pill-glyph" aria-hidden="true">' + GLYPH[t] + '</span><span class="pill-text">' + escapeHtml(wording || label(value)) + '</span>';
  }

  function toneSpan(value) {
    var t = tone(value);
    return '<span class="tone" data-tone="' + t + '"><span aria-hidden="true">' + GLYPH[t] + '</span> ' + escapeHtml(label(value)) + '</span>';
  }

  function tile(title, detail, stateValue) {
    return '<div class="tile"><div><strong>' + escapeHtml(title) + '</strong><small>' + escapeHtml(detail) + '</small></div>' + toneSpan(stateValue) + '</div>';
  }

  function ms(value) { return isNum(value) ? Math.round(Number(value)) + ' ms' : NOT_REPORTED; }

  function renderModules(data) {
    var net = data.network || {}, dns = data.dns || {}, routing = data.routing || {}, recovery = data.recovery || {}, tunnel = data.tunnel || {}, obs = data.observability || {};
    var modules = [
      ['Network', net.health || net.connection, net.currentRoute || 'No route reported'],
      ['DNS', dns.health, dns.resolver || 'No resolver reported'],
      ['Routing', routing.status, routing.mode ? label(routing.mode) : 'No mode reported'],
      ['Recovery', recovery.status, (Array.isArray(recovery.issues) ? recovery.issues.length : 0) + ' issue(s)'],
      ['Tunnel', tunnel.activeTunnel ? 'healthy' : 'unknown', tunnel.activeTunnel ? String(tunnel.activeTunnel) : 'No active tunnel'],
      ['Observability', obs.health, obs.metrics ? 'Metrics ' + label(obs.metrics).toLowerCase() : 'No metrics reported']
    ];
    $('#module-grid').innerHTML = modules.map(function (m) { return tile(m[0], m[2], m[1]); }).join('');
  }

  function renderInterfaces(list) {
    var node = $('#interface-list');
    if (!Array.isArray(list) || list.length === 0) {
      node.innerHTML = '<p class="empty-note">No interface probes were reported in the latest snapshot.</p>';
      text('#interface-count', '0 probes');
      return;
    }
    text('#interface-count', list.length + (list.length === 1 ? ' probe' : ' probes'));
    node.innerHTML = list.map(function (item) {
      var detail = isNum(item && item.latencyMs) ? 'Latency ' + ms(item.latencyMs) : 'Latency not reported';
      return tile(item && item.name ? item.name : 'Probe', detail, item && item.state);
    }).join('');
  }

  function renderLatencyBars(data) {
    var rows = [];
    (Array.isArray(data.network && data.network.interfaces) ? data.network.interfaces : []).forEach(function (item) {
      if (item && isNum(item.latencyMs)) rows.push([item.name || 'Probe', Number(item.latencyMs)]);
    });
    if (data.dns && isNum(data.dns.latencyMs)) rows.push(['DNS resolver', Number(data.dns.latencyMs)]);
    var node = $('#latency-bars');
    if (rows.length === 0) {
      node.innerHTML = '<p class="empty-note">No latency measurements were reported.</p>';
      return;
    }
    var max = Math.max.apply(null, rows.map(function (r) { return r[1]; })) || 1;
    node.innerHTML = rows.map(function (r) {
      var width = Math.max(2, Math.round((r[1] / max) * 100));
      return '<div class="bar-row"><div class="bar-meta"><span>' + escapeHtml(r[0]) + '</span><span>' + Math.round(r[1]) + ' ms</span></div><svg class="bar-track" viewBox="0 0 100 8" preserveAspectRatio="none" role="presentation" width="100%" height="8"><rect class="bar-bg" x="0" y="0" width="100" height="8" rx="4"></rect><rect class="bar-fg" x="0" y="0" width="' + width + '" height="8" rx="4"></rect></svg></div>';
    }).join('');
  }

  function renderCandidates(candidates) {
    var node = $('#candidate-list');
    if (!Array.isArray(candidates) || candidates.length === 0) {
      node.innerHTML = '<span class="muted">No probe candidates reported.</span>';
      return;
    }
    node.innerHTML = candidates.map(function (c) {
      var accepted = Boolean(c && c.accepted);
      var name = escapeHtml(c && c.name ? c.name : 'probe');
      var score = isNum(c && c.score) ? ' · ' + Number(c.score) + '/100' : '';
      var reason = c && c.reason ? ' title="' + escapeHtml(c.reason) + '"' : '';
      return '<span class="chip" data-tone="' + (accepted ? 'ok' : 'warn') + '"' + reason + '>' + (accepted ? '● ' : '▲ ') + name + score + '</span>';
    }).join('');
  }

  function renderIssues(issues) {
    var node = $('#issue-list');
    if (!Array.isArray(issues) || issues.length === 0) {
      node.innerHTML = '<li data-tone="ok">● No active recovery issues reported.</li>';
      return;
    }
    node.innerHTML = issues.map(function (issue) {
      var value = typeof issue === 'string' ? issue : (issue && (issue.message || issue.reason || issue.code)) || JSON.stringify(issue);
      return '<li data-tone="warn">▲ ' + escapeHtml(value) + '</li>';
    }).join('');
  }

  function renderTunnel(tunnel) {
    var info = tunnel || {};
    var list = Array.isArray(info.tunnels) ? info.tunnels : [];
    var active = info.activeTunnel;
    text('#tunnel-active', active ? String(active) : 'None active', 'None active');
    text('#tunnel-count', list.length);
    setPill('#tunnel-chip', active ? 'healthy' : 'unknown', active ? 'Active' : 'No active tunnel');
    $('#tunnel-list').innerHTML = list.map(function (item) {
      var name = typeof item === 'string' ? item : (item && (item.name || item.id)) || 'Tunnel';
      var state = typeof item === 'object' && item ? item.state || item.status : (name === active ? 'healthy' : 'unknown');
      return tile(name, name === active ? 'Active' : 'Configured', state);
    }).join('');
    $('#tunnel-empty').hidden = Boolean(active) || list.length > 0;
  }

  function renderViolations(violations) {
    var node = $('#violation-list');
    if (!Array.isArray(violations) || violations.length === 0) { node.hidden = true; node.innerHTML = ''; return; }
    node.hidden = false;
    node.innerHTML = violations.map(function (v) {
      var value = typeof v === 'string' ? v : (v && (v.message || v.reason || v.code)) || JSON.stringify(v);
      return '<li data-tone="warn">▲ ' + escapeHtml(value) + '</li>';
    }).join('');
  }

  function renderOutcomes(outcomes) {
    var node = $('#outcome-list');
    if (!Array.isArray(outcomes) || outcomes.length === 0) { node.innerHTML = '<span class="muted">None reported.</span>'; return; }
    node.innerHTML = outcomes.map(function (o) { return '<span class="chip">' + escapeHtml(label(o)) + '</span>'; }).join('');
  }

  function updateChart(score) {
    if (isNum(score)) {
      history.push({ score: Math.max(0, Math.min(100, Number(score))) });
      if (history.length > 24) history.shift();
    }
    text('#history-count', history.length + (history.length === 1 ? ' sample' : ' samples'));
    var svg = $('#score-chart');
    var empty = $('#chart-empty');
    if (history.length < 2) { svg.innerHTML = ''; empty.hidden = false; return; }
    empty.hidden = true;
    var width = 640, height = 180, left = 32, right = 12, top = 14, bottom = 14;
    var usableWidth = width - left - right, usableHeight = height - top - bottom;
    var points = history.map(function (p, i) {
      return { x: +(left + (i / (history.length - 1)) * usableWidth).toFixed(1), y: +(top + (1 - p.score / 100) * usableHeight).toFixed(1) };
    });
    var line = points.map(function (p, i) { return (i ? 'L' : 'M') + p.x + ' ' + p.y; }).join(' ');
    var area = line + ' L' + points[points.length - 1].x + ' ' + (height - bottom) + ' L' + points[0].x + ' ' + (height - bottom) + ' Z';
    var last = points[points.length - 1];
    svg.innerHTML = '<path d="M' + left + ' ' + top + ' H' + (width - right) + ' M' + left + ' ' + (top + usableHeight / 2) + ' H' + (width - right) + ' M' + left + ' ' + (height - bottom) + ' H' + (width - right) + '" class="chart-grid"/>' +
      '<text x="0" y="' + (top + 4) + '" class="chart-label">100</text><text x="4" y="' + (top + usableHeight / 2 + 4) + '" class="chart-label">50</text><text x="10" y="' + (height - bottom + 4) + '" class="chart-label">0</text>' +
      '<path d="' + area + '" class="chart-area"/><path d="' + line + '" class="chart-line"/><circle cx="' + last.x + '" cy="' + last.y + '" r="5" class="chart-point"/>';
  }

  function render(data) {
    var network = data.network || {}, dns = data.dns || {}, routing = data.routing || {}, recovery = data.recovery || {};
    var decision = data.decision || {}, security = data.security || {}, autopilot = data.autopilot || {};
    var dependencies = data.dependencies || {}, observability = data.observability || {}, eventBus = data.eventBus || {};
    var issues = Array.isArray(recovery.issues) ? recovery.issues : [];
    var score = isNum(decision.score) ? Number(decision.score) : NaN;
    var overall = network.health || network.connection;

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

    renderLatencyBars(data);
    renderCandidates(decision.candidates);
    text('#decision-age', isNum(decision.decisionAgeSeconds) ? decision.decisionAgeSeconds + ' s' : NOT_REPORTED);
    var dbLatency = data.diagnostics && data.diagnostics.databaseLatencyMs;
    text('#database-latency-metric', ms(dbLatency));
    updateChart(score);

    renderTunnel(data.tunnel);

    text('#security-state', label(security.state));
    text('#protection-mode', label(security.protectionState));
    text('#kill-switch', label(security.killSwitch));
    text('#dns-leak', label(security.dnsLeak));
    text('#route-leak', label(security.routeLeak));
    text('#ipv6-state', label(security.ipv6));
    text('#security-validation', label(decision.securityValidation));
    text('#security-explanation', security.explanation, 'Reflects the backend\'s reported posture. Observe-only means enforcement is not active.');
    setPill('#security-chip', security.state);
    renderViolations(security.violations);

    setPill('#autopilot-chip', autopilot.enabled ? autopilot.mode : 'observe-only', autopilot.enabled ? label(autopilot.mode) : 'Observe only');
    text('#autopilot-mode', label(autopilot.mode));
    text('#autopilot-enabled', autopilot.enabled ? 'Automation enabled' : 'Automation disabled · observe-only');
    text('#active-actions', isNum(autopilot.activeActions) ? autopilot.activeActions : NOT_REPORTED);
    text('#circuit-breaker', label(autopilot.circuitBreaker));
    text('#verification-state', label(autopilot.verificationState));
    text('#rollback-state', label(autopilot.rollbackState));
    renderOutcomes(autopilot.recentOutcomes);

    text('#issue-count', issues.length);
    renderIssues(issues);
    setPill('#recovery-chip', recovery.status);
    text('#database-state', label(dependencies.database));
    text('#database-latency', ms(dbLatency));
    text('#queue-state', label(dependencies.queue));
    text('#eventbus-state', eventBus.status ? label(eventBus.status) + (eventBus.scope ? ' (' + eventBus.scope + ')' : '') : NOT_REPORTED);
    var telemetry = observability.telemetry || {};
    text('#telemetry-state', telemetry.enabled === false ? 'Disabled' : (telemetry.enabled ? 'Enabled' : label(observability.metrics)));
    text('#telemetry-exporter', telemetry.exporterConfigured ? 'Configured' : 'Not configured');

    text('#last-updated', data.updatedAt ? new Date(data.updatedAt).toLocaleString() : new Date().toLocaleTimeString());
    text('#source-label', 'Source: ' + (data.source || 'API'));
    $('#raw-payload').textContent = JSON.stringify(data, null, 2);
    lastGoodAt = new Date();
    $('#app').classList.remove('is-loading');
    $('#error-banner').hidden = true;
    $('#stale-note').hidden = true;
    $('#live-region').textContent = 'Platform status updated: ' + (overall ? label(overall) : 'unknown');
  }

  function showError(message) {
    $('#error-message').textContent = message;
    $('#error-banner').hidden = false;
    setPill('#global-status', 'unavailable', 'API unavailable');
    var stale = $('#stale-note');
    if (lastGoodAt) {
      stale.textContent = 'Showing the last successful snapshot from ' + lastGoodAt.toLocaleTimeString() + '. Values below may be out of date.';
      stale.hidden = false;
    } else {
      stale.hidden = true;
    }
    $('#app').classList.remove('is-loading');
  }

  async function refresh() {
    if (inFlight) return;
    inFlight = true;
    var button = $('#refresh-button');
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'Refreshing…';
    try {
      var response = await fetch('/api/v1/platform/status', { cache: 'no-store', headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error('Platform status API returned HTTP ' + response.status);
      var payload = await response.json();
      if (!payload || payload.success !== true || !payload.data) throw new Error('Unexpected platform status response shape');
      render(payload.data);
    } catch (error) {
      var message = error instanceof Error ? error.message : String(error);
      showError('Unable to load live platform status: ' + message + '. Check that the API and database are running, then retry.');
    } finally {
      inFlight = false;
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.textContent = 'Refresh';
    }
  }

  function scheduleRefresh() {
    if (refreshTimer) window.clearInterval(refreshTimer);
    refreshTimer = null;
    if (autoRefresh) refreshTimer = window.setInterval(function () { if (!document.hidden) refresh(); }, 30000);
  }

  function showView(name, moveFocus) {
    if (!VIEWS[name]) name = 'overview';
    var sections = document.querySelectorAll('.view');
    for (var i = 0; i < sections.length; i++) sections[i].hidden = sections[i].getAttribute('data-view') !== name;
    var links = document.querySelectorAll('.nav a');
    for (var j = 0; j < links.length; j++) {
      if (links[j].getAttribute('data-view') === name) links[j].setAttribute('aria-current', 'page');
      else links[j].removeAttribute('aria-current');
    }
    text('#view-eyebrow', VIEWS[name][0]);
    text('#view-title', VIEWS[name][1]);
    document.title = VIEWS[name][1] + ' · IRP Control Center';
    if (moveFocus) $('#main').focus();
    // Render view-specific content
    if (name === 'member') { renderMemberSubscription(); renderMemberConnection(); }
    if (name === 'plans') { renderMemberPlans(); }
    if (name === 'member-devices') { renderMemberDevices(); }
    if (name === 'admin') { renderComponents(); renderCapabilities(); renderProvidersView(); renderDevicesView(); }
    if (name === 'components') { renderComponents(); }
    if (name === 'capabilities') { renderCapabilities(); }
    if (name === 'providers') { renderProvidersView(); }
    if (name === 'decisions') { renderDecisions(); }
    if (name === 'incidents') { renderIncidents(); }
    if (name === 'events') { renderEvents(); }
    if (name === 'storage') { renderStorage(); }
  }

  function currentViewFromHash() { return (window.location.hash || '').replace('#', '') || 'overview'; }

  function applyTheme(theme) {
    var root = document.documentElement;
    if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme); else root.removeAttribute('data-theme');
    var button = $('#theme-button');
    button.textContent = 'Theme: ' + theme;
    button.setAttribute('aria-label', 'Colour theme: ' + theme + '. Activate to change.');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#F4F7FB' : '#0A0F1C');
  }

  function loadTheme() {
    try { var saved = window.localStorage.getItem(THEME_KEY); if (THEMES.indexOf(saved) >= 0) return saved; } catch (error) { /* storage unavailable */ }
    return 'auto';
  }

  $('#refresh-button').addEventListener('click', refresh);
  $('#retry-button').addEventListener('click', refresh);
  $('#auto-button').addEventListener('click', function () {
    autoRefresh = !autoRefresh;
    var button = $('#auto-button');
    button.textContent = 'Auto refresh: ' + (autoRefresh ? 'on' : 'off');
    button.setAttribute('aria-pressed', String(autoRefresh));
    scheduleRefresh();
  });
  $('#theme-button').addEventListener('click', function () {
    var next = THEMES[(THEMES.indexOf(loadTheme()) + 1) % THEMES.length];
    try { window.localStorage.setItem(THEME_KEY, next); } catch (error) { /* storage unavailable: theme still applies for this page */ }
    applyTheme(next);
  });
  $('#auth-close').addEventListener('click', function () { showApp(); });
  $('#logout-button').addEventListener('click', function () {
    accessToken = null;
    userEmail = null;
    userRole = null;
    try { window.localStorage.removeItem('irp_access_token'); window.localStorage.removeItem('irp_user_email'); window.localStorage.removeItem('irp_user_role'); } catch {}
    showAuth();
  });
  $('#signin-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var email = $('#signin-email').value;
    var password = $('#signin-password').value;
    try {
      var data = await apiAuthJson('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: email, password: password }) });
      accessToken = data.data.accessToken;
      userEmail = data.data.user.email;
      userRole = (data.data.user.roles && data.data.user.roles[0]) || null;
      localStorage.setItem('irp_access_token', accessToken);
      localStorage.setItem('irp_user_email', userEmail);
      localStorage.setItem('irp_user_role', userRole);
      showApp();
      refresh();
    } catch (error) {
      var m = $('#signin-message');
      m.textContent = error.message || 'Sign in failed';
      m.hidden = false;
    }
  });
  $('#signup-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var email = $('#signup-email').value;
    var name = $('#signup-name').value;
    var password = $('#signup-password').value;
    try {
      await apiAuthJson('/api/v1/auth/register', { method: 'POST', body: JSON.stringify({ email: email, password: password, name: name }) });
      var m = $('#signup-message');
      m.textContent = 'Account created. Check dev email capture at /api/v1/dev/emails for the verification token, then sign in.';
      m.hidden = false;
      m.className = 'form-message muted';
    } catch (error) {
      var m = $('#signup-message');
      m.textContent = error.message || 'Account creation failed';
      m.hidden = false;
    }
  });
  var authTabs = document.querySelectorAll('.auth-tab');
  authTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      authTabs.forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      var target = tab.getAttribute('data-tab');
      document.getElementById('signin-form').hidden = target !== 'signin';
      document.getElementById('signup-form').hidden = target !== 'signup';
    });
  });
  // Restore auth state from localStorage
  try {
    var storedToken = window.localStorage.getItem('irp_access_token');
    var storedEmail = window.localStorage.getItem('irp_user_email');
    var storedRole = window.localStorage.getItem('irp_user_role');
    if (storedToken) {
      accessToken = storedToken;
      userEmail = storedEmail || null;
      userRole = storedRole || null;
      showApp();
    }
  } catch (error) { /* storage unavailable */ }

  // ── Member portal rendering ─────────────────────────────────────────
  async function renderMemberSubscription() {
    try {
      var data = await apiAuthJson('/api/v1/subscriptions/me');
      var sub = data.data.subscription;
      var ents = data.data.entitlements || [];
      var node = $('#member-subscription');
      if (!node) return;
      if (!sub) {
        node.innerHTML = '<div class="empty-note">No active subscription. Select a plan to get started.</div>';
        text('#member-plan-name', 'None');
        text('#member-plan-status', 'Not subscribed');
        text('#member-plan-expires', '—');
        return;
      }
      text('#member-plan-name', sub.planName || '—');
      text('#member-plan-status', sub.status || '—');
      text('#member-plan-expires', sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString() : '—');
      text('#member-plan-auto-renew', sub.autoRenew ? 'Enabled' : 'Disabled');
      var entHtml = ents.map(function (e) {
        var active = e.status === 'ACTIVE';
        var expires = e.expiresAt ? new Date(e.expiresAt) : null;
        var expired = expires && expires <= new Date();
        return '<span class="chip ' + (active && !expired ? 'ok' : 'warn') + '">' + escapeHtml(e.feature) + ' ' + (active && !expired ? '●' : '○') + '</span>';
      }).join('');
      $('#member-entitlements').innerHTML = entHtml || '<span class="muted">No entitlements.</span>';
      var payNode = $('#member-payments');
      if (payNode) {
        try {
          var payData = await apiAuthJson('/api/v1/subscriptions/payments');
          var pays = payData.data.payments || [];
          payNode.innerHTML = pays.map(function (p) {
            var date = p.paidAt || p.createdAt;
            return '<div style="padding:8px 12px;border:1px solid var(--border);border-radius:var(--control);background:var(--surface-raised);margin-bottom:8px"><div><strong>$' + (Number(p.amountUsd) / 100).toFixed(2) + ' ' + escapeHtml(p.currency) + '</strong><small>' + escapeHtml(p.status) + '</small></div><div style="margin-top:4px;font-size:13px;color:var(--muted)">' + escapeHtml(p.provider) + ' · ' + new Date(date).toLocaleDateString() + '</div></div>';
          }).join('') || '<div class="muted">No payment history.</div>';
        } catch { payNode.innerHTML = '<div class="muted">Unable to load payment history.</div>'; }
      }
    } catch (err) {
      $('#member-plan-status').textContent = 'Unable to load';
    }
  }

  async function renderMemberPlans() {
    try {
      var data = await apiAuthJson('/api/v1/subscriptions/plans');
      var plans = data.data.plans || [];
      var node = $('#member-plans');
      if (!node) return;
      if (plans.length === 0) { node.innerHTML = '<p class="empty-note">No plans available.</p>'; return; }
      node.innerHTML = plans.map(function (p) {
        var features = p.planFeatures || p.features || {};
        var featureList = Object.entries(features).filter(function (kv) { return kv[1] === true; }).map(function (kv) { return '<li>' + escapeHtml(kv[0]) + '</li>'; }).join('');
        return '<article class="card"><div class="card-head"><strong>' + escapeHtml(p.planname || p.name || 'Unknown') + '</span><span class="pill" style="float:right">$' + (Number(p.priceUsd || 0) / 100).toFixed(2) + '/mo</span></div><p style="color:var(--muted);font-size:13px;margin:8px 0">' + escapeHtml(p.plandescription || p.description || '') + '</p><ul class="list" style="margin-bottom:12px">' + featureList + '</ul><div><button class="button button-primary" onclick="appPurchasePlan(\'' + escapeHtml(p.planslug || p.slug) + '\')">Subscribe</button></div></article>';
      }).join('');
    } catch (err) {
      $('#member-plans').innerHTML = '<p class="empty-note">Unable to load plans.</p>';
    }
  }

  window.appPurchasePlan = async function (planSlug) {
    try {
      var res = await apiAuthRequest('/api/v1/subscriptions/purchase', { method: 'POST', body: JSON.stringify({ planSlug: planSlug, paymentProvider: 'test' }) });
      if (!res.ok) throw new Error('Purchase failed: ' + res.status);
      var data = await res.json();
      alert('Subscription registered. Complete payment verification to activate.');
      await renderMemberSubscription();
      await renderMemberPlans();
    } catch (err) { alert('Failed to purchase: ' + err.message); }
  };

  window.appVerifyPayment = async function (txId) {
    try {
      var res = await apiAuthRequest('/api/v1/subscriptions/verify-payment', { method: 'POST', body: JSON.stringify({ paymentTransactionId: txId, providerRef: 'test_verify_' + Date.now() }) });
      if (!res.ok) throw new Error('Verification failed: ' + res.status);
      alert('Payment verified! Subscription activated.');
      await renderMemberSubscription();
    } catch (err) { alert('Payment verification failed: ' + err.message); }
  };

  async function renderMemberDevices() {
    try {
      var data = await apiAuthJson('/api/v1/devices');
      var devices = data.data.devices || [];
      var node = $('#member-device-list');
      if (!node) return;
      if (devices.length === 0) { node.innerHTML = '<p class="empty-note">No devices enrolled.</p>'; return; }
      node.innerHTML = devices.map(function (d) {
        var authz = d.subStatus === 'ACTIVE' ? 'authorized' : 'unauthorized';
        var active = d.status === 'ACTIVE';
        return '<div class="tile"><div><strong>' + escapeHtml(d.label || d.deviceId) + '</strong><small>' + escapeHtml(d.platform || '—') + '</small></div><div><span class="chip ' + (active ? 'ok' : 'warn') + '">' + escapeHtml(d.status) + '</span><span class="chip ' + authz + '">' + authz + '</span>' + (active ? '<button class="button button-danger" onclick="appDisconnectDevice(\'' + escapeHtml(d.deviceId) + '\')">Disconnect</button>' : '<button class="button button-primary" onclick="appConnectDevice(\'' + escapeHtml(d.deviceId) + '\')">Connect</button>') + '<button class="button button-text" onclick="appRevokeDevice(\'' + escapeHtml(d.deviceId) + '\')">Revoke</button></div></div>';
      }).join('');
    } catch (err) {
      $('#member-device-list').innerHTML = '<p class="empty-note">Unable to load devices.</p>';
    }
  }

  window.appConnectDevice = async function (deviceId) {
    try {
      var res = await apiAuthRequest('/api/v1/devices/' + deviceId + '/connect', { method: 'POST', body: JSON.stringify({}) });
      if (!res.ok) throw new Error('Connect failed: ' + res.status);
      await renderMemberDevices();
    } catch (err) { alert('Connect failed: ' + err.message); }
  };

  window.appDisconnectDevice = async function (deviceId) {
    try {
      var res = await apiAuthRequest('/api/v1/devices/' + deviceId + '/disconnect', { method: 'POST', body: JSON.stringify({}) });
      if (!res.ok) throw new Error('Disconnect failed: ' + res.status);
      await renderMemberDevices();
    } catch (err) { alert('Disconnect failed: ' + err.message); }
  };

  window.appRevokeDevice = async function (deviceId) {
    if (!confirm('Revoke this device? This cannot be undone.')) return;
    try {
      var res = await apiAuthRequest('/api/v1/devices/' + deviceId, { method: 'DELETE' });
      if (!res.ok) throw new Error('Revoke failed: ' + res.status);
      await renderMemberDevices();
    } catch (err) { alert('Revoke failed: ' + err.message); }
  };

  window.appEnrollDevice = async function () {
    var deviceId = $('#member-enroll-device-id').value;
    var label = $('#member-enroll-label').value;
    var platform = $('#member-enroll-platform').value;
    if (!deviceId) { alert('Device ID is required'); return; }
    try {
      var res = await apiAuthRequest('/api/v1/devices/enroll', { method: 'POST', body: JSON.stringify({ deviceId: deviceId, label: label, platform: platform }) });
      if (!res.ok) throw new Error('Enroll failed: ' + res.status);
      $('#member-enroll-form').hidden = true;
      $('#member-enroll-device-id').value = '';
      $('#member-enroll-label').value = '';
      $('#member-enroll-platform').value = '';
      await renderMemberDevices();
    } catch (err) { alert('Enroll failed: ' + err.message); }
  };

  window.appRenewSubscription = async function () {
    try {
      var res = await apiAuthRequest('/api/v1/subscriptions/renew', { method: 'POST', body: JSON.stringify({ paymentProvider: 'test' }) });
      if (!res.ok) throw new Error('Renew failed: ' + res.status);
      var data = await res.json();
      alert('Renewal payment pending. Verify payment to extend.');
      window.appPendingRenewTxId = data.data.paymentTransactionId;
      await renderMemberSubscription();
    } catch (err) { alert('Renew failed: ' + err.message); }
  };

  window.appCancelSubscription = async function () {
    if (!confirm('Cancel your subscription? This will suspend your devices.')) return;
    try {
      var res = await apiAuthRequest('/api/v1/subscriptions/cancel', { method: 'POST', body: JSON.stringify({}) });
      if (!res.ok) throw new Error('Cancel failed: ' + res.status);
      alert('Subscription cancelled.');
      await renderMemberSubscription();
    } catch (err) { alert('Cancel failed: ' + err.message); }
  };

  async function renderMemberConnection() {
    try {
      var data = await apiAuthJson('/api/v1/subscriptions/me');
      var sub = data.data.subscription;
      var ents = data.data.entitlements || [];
      var connectEnt = ents.find(function (e) { return e.feature === 'connect'; });
      var hasActiveEnt = connectEnt && connectEnt.status === 'ACTIVE' && (!connectEnt.expiresAt || new Date(connectEnt.expiresAt) > new Date());
      var subActive = sub && sub.status === 'ACTIVE' && (!sub.expiresAt || new Date(sub.expiresAt) > new Date());
      var authorized = subActive && hasActiveEnt;
      $('#member-conn-status').textContent = subActive ? 'Active' : 'Inactive';
      $('#member-conn-authorized').textContent = authorized ? 'Yes' : 'No';
      $('#member-conn-quality').textContent = authorized ? 'Good' : '—';
      $('#member-conn-last-connected').textContent = '—';
      $('#member-connect-btn').hidden = authorized || subActive ? false : true;
      $('#member-disconnect-btn').hidden = !authorized;
      var btn = $('#member-connect-btn');
      if (authorized) btn.textContent = 'Connect';
      btn.hidden = false;
    } catch (err) { $('#member-conn-status').textContent = 'Unable to load'; }
  }

  // ── Admin control center rendering ──────────────────────────────────
  async function renderComponents() {
    try {
      var data = await apiAuthJson('/api/v1/runtime/capabilities');
      var caps = data.data || [];
      var node = $('#admin-components');
      if (!node) return;
      if (caps.length === 0) { node.innerHTML = '<p class="empty-note">No components reported.</p>'; return; }
      node.innerHTML = caps.map(function (c) {
        return '<div class="tile"><div><strong>' + escapeHtml(c.adapterId || c.id) + '</strong><small>' + escapeHtml(c.subsystem || '') + '</small></div><span class="chip ' + (c.supportsLive ? 'ok' : 'warn') + '">' + (c.supportsLive ? 'live' : 'simulation-only') + '</span></div>';
      }).join('');
    } catch (err) {
      $('#admin-components').innerHTML = '<p class="empty-note">Unable to load components.</p>';
    }
  }

  async function renderCapabilities() {
    try {
      var data = await apiAuthJson('/api/v1/runtime/capabilities');
      var caps = data.data || [];
      var node = $('#admin-capabilities');
      if (!node) return;
      if (caps.length === 0) { node.innerHTML = '<p class="empty-note">No capabilities reported.</p>'; return; }
      node.innerHTML = caps.map(function (c) {
        var capsList = Array.isArray(c.capabilities) ? c.capabilities.join(', ') : '—';
        return '<div class="tile"><div><strong>' + escapeHtml(c.adapterId || c.id) + '</strong><small>' + escapeHtml(c.subsystem || '') + '</small></div><span class="chip ' + (c.supportsLive ? 'ok' : 'warn') + '">' + capsList + '</span></div>';
      }).join('');
    } catch (err) {
      $('#admin-capabilities').innerHTML = '<p class="empty-note">Unable to load capabilities.</p>';
    }
  }

  async function renderProvidersView() {
    try {
      var data = await apiAuthJson('/api/v1/platform/status');
      var pd = data.data || {};
      var node = $('#admin-providers');
      if (!node) return;
      var items = [];
      if (pd.network && pd.network.interfaces) {
        pd.network.interfaces.forEach(function (iface) { items.push({ name: iface.name || 'Interface', detail: 'Latency ' + ms(iface.latencyMs), state: iface.state || 'unknown' }); });
      }
      if (pd.dns) items.push({ name: 'DNS resolver', detail: pd.dns.resolver || 'Not reported', state: pd.dns.health || 'unknown' });
      if (pd.routing) items.push({ name: 'Current route', detail: pd.routing.currentRoute || 'Not reported', state: pd.routing.status || 'unknown' });
      if (items.length === 0) { node.innerHTML = '<p class="empty-note">No providers reported.</p>'; return; }
      node.innerHTML = items.map(function (i) { return tile(i.name, i.detail, i.state); }).join('');
    } catch (err) {
      $('#admin-providers').innerHTML = '<p class="empty-note">Unable to load providers.</p>';
    }
  }

  async function renderDevicesView() {
    try {
      var data = await apiAuthJson('/api/v1/devices');
      var devices = data.data.devices || [];
      var node = $('#admin-devices');
      if (!node) return;
      if (devices.length === 0) { node.innerHTML = '<p class="empty-note">No devices enrolled.</p>'; return; }
      node.innerHTML = devices.map(function (d) {
        var authz = d.subStatus === 'ACTIVE' ? 'authorized' : 'unauthorized';
        var active = d.status === 'ACTIVE';
        return '<div class="tile"><div><strong>' + escapeHtml(d.label || d.deviceId) + '</strong><small>' + escapeHtml(d.platform || '—') + ' · ' + escapeHtml(d.userEmail || '—') + '</small></div><div><span class="chip ' + (active ? 'ok' : 'warn') + '">' + escapeHtml(d.status) + '</span><span class="chip ' + authz + '">' + authz + '</span>' + (active ? '<button class="button button-danger" onclick="appDisconnectDevice(\'' + escapeHtml(d.deviceId) + '\')">Disconnect</button>' : '<button class="button button-primary" onclick="appConnectDevice(\'' + escapeHtml(d.deviceId) + '\')">Connect</button>') + '<button class="button button-text" onclick="appRevokeDevice(\'' + escapeHtml(d.deviceId) + '\')">Revoke</button></div></div>';
      }).join('');
    } catch (err) {
      $('#admin-devices').innerHTML = '<p class="empty-note">Unable to load devices.</p>';
    }
  }

  async function renderDecisions() {
    try {
      var data = await apiAuthJson('/api/v1/runtime/decisions');
      var decisions = data.data || [];
      var node = $('#admin-decisions');
      if (!node) return;
      if (decisions.length === 0) { node.innerHTML = '<div class="muted">No decisions recorded yet.</div>'; return; }
      node.innerHTML = decisions.map(function (d) {
        return '<div class="list-item" style="padding:10px 12px;border:1px solid var(--border);border-radius:var(--control);background:var(--surface-raised);margin-bottom:8px"><div><strong>' + escapeHtml(d.decisionId) + '</strong><small>' + escapeHtml(d.outcome) + ' · ' + escapeHtml(d.durationMs != null ? d.durationMs + 'ms' : '') + '</small></div><div style="margin-top:4px;font-size:13px;color:var(--muted)">' + escapeHtml(d.explanation ? (d.explanation[0] || 'No explanation recorded') : 'No explanation recorded') + '</div></div>';
      }).join('');
    } catch (err) {
      $('#admin-decisions').innerHTML = '<p class="empty-note">Unable to load decisions.</p>';
    }
  }

  async function renderIncidents() {
    try {
      var data = await apiAuthJson('/api/v1/runtime/incidents');
      var incidents = data.data || [];
      var node = $('#admin-incidents');
      if (!node) return;
      if (incidents.length === 0) { node.innerHTML = '<li data-tone="ok">● No incidents reported.</li>'; return; }
      node.innerHTML = incidents.map(function (i) {
        var value = typeof i === 'string' ? i : (i && (i.message || i.reason || i.code)) || JSON.stringify(i);
        return '<li data-tone="warn">▲ ' + escapeHtml(value) + '</li>';
      }).join('');
    } catch (err) {
      $('#admin-incidents').innerHTML = '<li class="muted">Unable to load incidents.</li>';
    }
  }

  async function renderEvents() {
    try {
      var res = await apiAuthRequest('/api/v1/platform/events/stream');
      if (!res.ok) throw new Error('Events stream unavailable');
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var node = $('#admin-events');
      if (!node) return;
      node.innerHTML = '';
      var count = 0;
      while (true) {
        var result = await reader.read();
        if (result.done) break;
        var chunk = decoder.decode(result.value, { stream: true });
        var lines = chunk.split('\n');
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (line.startsWith('event:')) {
            var evType = line.substring(6).trim();
          } else if (line.startsWith('data:')) {
            try {
              var payload = JSON.parse(line.substring(5));
              var ev = document.createElement('div');
              ev.className = 'list-item';
              ev.style.padding = '8px 12px';
              ev.style.border = '1px solid var(--border)';
              ev.style.borderRadius = 'var(--control)';
              ev.style.background = 'var(--surface-raised)';
              ev.style.marginBottom = '8px';
              ev.style.fontSize = '13px';
              ev.innerHTML = '<strong>' + escapeHtml(evType || 'event') + '</strong><span style="float:right;color:var(--muted);font-size:11px">' + new Date().toLocaleTimeString() + '</span><div style="margin-top:4px;color:var(--muted)">' + escapeHtml(JSON.stringify(payload.payload || payload)).slice(0, 200) + '</div>';
              node.prepend(ev);
              count++;
              if (count > 50) node.removeChild(node.lastChild);
            } catch { /* ignore parse errors */ }
          }
        }
      }
    } catch (err) {
      $('#admin-events').innerHTML = '<li class="muted">Unable to load events stream.</li>';
    }
  }

  async function renderStorage() {
    try {
      var data = await apiAuthJson('/api/v1/platform/status');
      var deps = data.data.dependencies || {};
      var diagnostics = data.data.diagnostics || {};
      var eventBus = data.data.eventBus || {};
      var obs = data.data.observability || {};
      text('#admin-storage-db', label(deps.database));
      text('#admin-storage-latency', ms(diagnostics.databaseLatencyMs));
      text('#admin-storage-queue', label(deps.queue));
      text('#admin-storage-eventbus', label(eventBus.status) + (eventBus.scope ? ' (' + eventBus.scope + ')' : ''));
      var telemetry = obs.telemetry || {};
      text('#admin-storage-telemetry', telemetry.enabled === false ? 'Disabled' : (telemetry.enabled ? 'Enabled' : label(obs.metrics)));
      text('#admin-storage-exporter', telemetry.exporterConfigured ? 'Configured' : 'Not configured');
    } catch (err) {
      $('#admin-storage-db').textContent = 'Unable to load';
    }
  }

  applyTheme(loadTheme());
  showView(currentViewFromHash(), false);
  refresh();
  scheduleRefresh();
})();
`;
