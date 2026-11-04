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
    diagnostics: ['Health and support', 'Diagnostics']
  };
  var THEMES = ['auto', 'light', 'dark'];
  var THEME_KEY = 'irp.dashboard.theme';
  var NOT_REPORTED = 'Not reported';
  var history = [];
  var autoRefresh = true;
  var refreshTimer = null;
  var lastGoodAt = null;
  var inFlight = false;

  function $(selector) { return document.querySelector(selector); }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function isNum(value) { return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)); }

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
  window.addEventListener('hashchange', function () { showView(currentViewFromHash(), true); });

  applyTheme(loadTheme());
  showView(currentViewFromHash(), false);
  refresh();
  scheduleRefresh();
})();
`;
