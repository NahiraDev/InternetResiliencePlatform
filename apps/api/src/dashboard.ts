export const dashboardHtml = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#080d18">
  <meta name="description" content="Live network health and resilience control center">
  <title>IRP Control Center</title>
  <link rel="stylesheet" href="/assets/dashboard.css">
  <script defer src="/assets/dashboard.js"></script>
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <a class="brand" href="/" aria-label="Internet Resilience Platform home">
        <span class="brand-mark" aria-hidden="true">IR</span>
        <span class="brand-copy"><strong>INTERNET RESILIENCE</strong><small>PLATFORM / CONTROL CENTER</small></span>
      </a>
      <div class="topbar-actions">
        <span id="global-status" class="status-pill status-waiting"><span class="status-dot"></span>Connecting</span>
        <button id="refresh-button" class="button button-quiet" type="button"><span aria-hidden="true">↻</span> Refresh</button>
        <button id="auto-button" class="button button-active" type="button" aria-pressed="true">Auto refresh: on</button>
      </div>
    </header>

    <main>
      <section class="page-heading">
        <div>
          <p class="eyebrow">LIVE OPERATIONS</p>
          <h1>Network overview</h1>
          <p class="muted">A live view of connectivity, routing, recovery and platform readiness.</p>
        </div>
        <div class="updated-block">
          <span class="muted-label">LAST UPDATED</span>
          <strong id="last-updated">Waiting for API…</strong>
          <span id="source-label" class="source-label">Source: pending</span>
        </div>
      </section>

      <section class="metric-grid" aria-label="Key network metrics">
        <article class="metric-card metric-primary">
          <div class="metric-head"><span>Network health score</span><span class="metric-icon">◈</span></div>
          <div class="metric-value"><strong id="health-score">—</strong><span>/ 100</span></div>
          <div class="metric-foot"><span id="health-caption">Awaiting measurements</span><span id="health-trend" class="trend">LIVE</span></div>
        </article>
        <article class="metric-card">
          <div class="metric-head"><span>Connection state</span><span class="metric-icon">⌁</span></div>
          <div class="metric-word" id="connection-state">—</div>
          <div class="metric-foot"><span id="route-caption">Route not available</span><span class="tiny-indicator"></span></div>
        </article>
        <article class="metric-card">
          <div class="metric-head"><span>DNS latency</span><span class="metric-icon">⌘</span></div>
          <div class="metric-value"><strong id="dns-latency">—</strong><span>ms</span></div>
          <div class="metric-foot"><span id="dns-caption">Resolver status pending</span></div>
        </article>
        <article class="metric-card">
          <div class="metric-head"><span>Active incidents</span><span class="metric-icon">!</span></div>
          <div class="metric-value"><strong id="incident-count">—</strong></div>
          <div class="metric-foot"><span id="approval-caption">Approvals pending: —</span></div>
        </article>
      </section>

      <section class="content-grid">
        <article class="panel network-panel">
          <div class="panel-heading">
            <div><p class="eyebrow">CONNECTIVITY</p><h2>Network performance</h2></div>
            <span id="network-health-chip" class="status-chip status-waiting">Waiting</span>
          </div>
          <div class="chart-summary">
            <div><span class="muted-label">CURRENT ROUTE</span><strong id="current-route">—</strong></div>
            <div><span class="muted-label">SCORE HISTORY</span><strong id="history-count">0 samples</strong></div>
          </div>
          <div class="chart-wrap">
            <svg id="score-chart" viewBox="0 0 640 150" role="img" aria-label="Recent network health score trend">
              <path d="M0 75 H640" class="chart-grid"></path>
              <text x="8" y="18" class="chart-label">100</text>
              <text x="8" y="142" class="chart-label">0</text>
              <path d="M28 75 H630" class="chart-empty"></path>
            </svg>
          </div>
          <div class="chart-legend"><span><i class="legend-dot"></i> Health score</span><span>Updates every 30 seconds</span></div>
        </article>

        <article class="panel decision-panel">
          <div class="panel-heading"><div><p class="eyebrow">DECISION ENGINE</p><h2>Current recommendation</h2></div><span class="decision-symbol">◎</span></div>
          <p id="decision-title" class="decision-title">Waiting for live decision…</p>
          <p id="decision-explanation" class="muted decision-explanation">The API recommendation will appear here when the first status snapshot arrives.</p>
          <div class="decision-meta">
            <div><span class="muted-label">CONFIDENCE</span><strong id="decision-confidence">—</strong></div>
            <div><span class="muted-label">MODE</span><strong id="decision-mode">—</strong></div>
            <div><span class="muted-label">POLICY</span><strong id="policy-state">—</strong></div>
          </div>
          <div class="candidate-block"><span class="muted-label">PROBE CANDIDATES</span><div id="candidate-list" class="candidate-list"><span class="muted">No probe data yet.</span></div></div>
        </article>

        <article class="panel">
          <div class="panel-heading"><div><p class="eyebrow">PLATFORM</p><h2>Component health</h2></div><span class="panel-icon">▦</span></div>
          <div id="module-grid" class="module-grid"><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div>
        </article>

        <article class="panel">
          <div class="panel-heading"><div><p class="eyebrow">RECOVERY</p><h2>Diagnostics & issues</h2></div><span id="recovery-chip" class="status-chip status-waiting">Waiting</span></div>
          <div class="issue-summary"><strong id="issue-count">—</strong><span>reported recovery issues</span></div>
          <ul id="issue-list" class="issue-list"><li class="muted">Waiting for diagnostics…</li></ul>
        </article>

        <article class="panel">
          <div class="panel-heading"><div><p class="eyebrow">SECURITY</p><h2>Protection posture</h2></div><span class="panel-icon">⬡</span></div>
          <div class="posture-row"><span>Security state</span><strong id="security-state">—</strong></div>
          <div class="posture-row"><span>Protection mode</span><strong id="protection-mode">—</strong></div>
          <div class="posture-row"><span>Kill switch</span><strong id="kill-switch">—</strong></div>
          <div class="posture-row"><span>DNS leak check</span><strong id="dns-leak">—</strong></div>
          <div class="posture-row"><span>Route leak check</span><strong id="route-leak">—</strong></div>
          <p class="panel-note">This panel reflects the backend's reported posture. Observe-only means enforcement is not active.</p>
        </article>

        <article class="panel">
          <div class="panel-heading"><div><p class="eyebrow">AUTOPILOT</p><h2>Automation state</h2></div><span id="autopilot-chip" class="status-chip status-waiting">Waiting</span></div>
          <div class="autopilot-state"><span class="autopilot-orb"></span><div><strong id="autopilot-mode">—</strong><small id="autopilot-enabled">State unavailable</small></div></div>
          <div class="posture-row"><span>Active actions</span><strong id="active-actions">—</strong></div>
          <div class="posture-row"><span>Circuit breaker</span><strong id="circuit-breaker">—</strong></div>
          <div class="posture-row"><span>Verification</span><strong id="verification-state">—</strong></div>
          <div class="posture-row"><span>Rollback</span><strong id="rollback-state">—</strong></div>
        </article>
      </section>

      <section class="bottom-grid">
        <div class="panel compact-panel">
          <div class="panel-heading"><div><p class="eyebrow">DEPENDENCIES</p><h2>Service readiness</h2></div></div>
          <div class="dependency-grid">
            <div><span class="muted-label">DATABASE</span><strong id="database-state">—</strong><small id="database-latency">Latency: —</small></div>
            <div><span class="muted-label">QUEUE</span><strong id="queue-state">—</strong><small>In-process queue</small></div>
            <div><span class="muted-label">TELEMETRY</span><strong id="telemetry-state">—</strong><small id="telemetry-exporter">Exporter: —</small></div>
          </div>
        </div>
        <div class="panel compact-panel api-panel">
          <div class="panel-heading"><div><p class="eyebrow">DEVELOPER TOOLS</p><h2>API access</h2></div></div>
          <div class="api-links">
            <a href="/docs" target="_blank" rel="noreferrer">Swagger API docs <span>↗</span></a>
            <a href="/api/v1/platform/status" target="_blank" rel="noreferrer">Live platform status <span>↗</span></a>
            <a href="/api/v1/ready" target="_blank" rel="noreferrer">Readiness probe <span>↗</span></a>
            <a href="/api/v1/metrics" target="_blank" rel="noreferrer">Prometheus metrics <span>↗</span></a>
          </div>
        </div>
      </section>

      <details class="raw-details">
        <summary>Raw platform status payload</summary>
        <pre id="raw-payload">No data loaded.</pre>
      </details>
      <div id="error-banner" class="error-banner" role="status" hidden></div>
    </main>

    <footer class="footer"><span>IRP Control Center</span><span>Live API data · Read-only dashboard · No host-network changes</span></footer>
  </div>
</body>
</html>`;

export const dashboardCss = String.raw`
:root{color-scheme:dark;--bg:#080d18;--surface:#101827;--surface-2:#131e30;--border:#243248;--text:#e8eef9;--muted:#91a0b6;--blue:#68a7ff;--cyan:#55d5cf;--green:#4bd49a;--yellow:#f4c66a;--red:#ff777e;--radius:17px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(ellipse at 50% -30%,#172b49 0,transparent 48%),var(--bg);color:var(--text);min-width:320px}
button,a{font:inherit}
.shell{max-width:1440px;margin:0 auto;padding:0 34px}
.topbar{height:76px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(145,160,182,.15);gap:20px}
.brand{display:flex;align-items:center;gap:12px;color:var(--text);text-decoration:none}
.brand-mark{width:38px;height:38px;display:grid;place-items:center;border-radius:11px;background:linear-gradient(145deg,#3b83dc,#1d4f94);font-size:13px;font-weight:800;letter-spacing:-1px;box-shadow:0 7px 24px #286bc344}
.brand-copy{display:grid;gap:3px;letter-spacing:1.4px;font-size:10px}
.brand-copy strong{font-size:11px}
.brand-copy small{color:var(--muted);font-size:9px;letter-spacing:1.8px}
.topbar-actions{display:flex;align-items:center;gap:10px}
.status-pill,.status-chip{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:999px;padding:7px 11px;font-size:11px;color:var(--muted);white-space:nowrap}
.status-dot{width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 10px currentColor}
.status-healthy{color:var(--green);border-color:#256c5480;background:#133c304d}
.status-degraded{color:var(--yellow);border-color:#8a682b80;background:#4a351b55}
.status-unhealthy{color:var(--red);border-color:#8d3e4480;background:#4a202755}
.status-waiting{color:var(--muted)}
.button{border:1px solid var(--border);background:#142137;color:var(--text);border-radius:10px;padding:8px 12px;font-size:11px;cursor:pointer;transition:.18s ease}
.button:hover{border-color:#4779b8;background:#1a2b46}
.button-quiet{background:transparent}
.button-active{color:var(--cyan);border-color:#367c79;background:#10363266}
main{padding:34px 0 24px}
.page-heading{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:25px;gap:20px}
.eyebrow{font-size:9px;letter-spacing:2px;color:var(--blue);font-weight:800;margin:0 0 8px}
h1{font-size:27px;line-height:1.15;letter-spacing:-.7px;margin:0 0 8px}
h2{font-size:15px;letter-spacing:-.2px;margin:0;font-weight:650}
.muted{color:var(--muted);font-size:12px;line-height:1.65;margin:0}
.muted-label{display:block;color:#778aa4;font-size:9px;letter-spacing:1.3px;font-weight:700}
.updated-block{text-align:right;display:grid;gap:5px}
.updated-block strong{font-size:12px;font-weight:600}
.source-label{font-size:10px;color:var(--muted)}
.metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:15px}
.metric-card,.panel{border:1px solid var(--border);background:linear-gradient(160deg,rgba(19,30,48,.97),rgba(13,21,35,.97));border-radius:var(--radius);box-shadow:0 12px 34px #00000014}
.metric-card{min-height:132px;padding:17px 18px;position:relative;overflow:hidden}
.metric-primary{background:linear-gradient(135deg,#153660,#102443 78%);border-color:#35649b}
.metric-primary:after{content:"";position:absolute;width:125px;height:125px;border:1px solid #8bbcff20;border-radius:50%;right:-36px;top:28px;box-shadow:0 0 0 16px #8bbcff09,0 0 0 34px #8bbcff06}
.metric-head,.metric-foot{display:flex;justify-content:space-between;align-items:center;gap:8px}
.metric-head{color:#b7c7dd;font-size:11px}
.metric-icon{font-size:17px;color:#8ebaff}
.metric-value{display:flex;align-items:baseline;gap:7px;margin:12px 0 8px}
.metric-value strong{font-size:31px;line-height:1;letter-spacing:-1px}
.metric-value>span{font-size:11px;color:var(--muted)}
.metric-word{font-size:22px;font-weight:700;letter-spacing:-.5px;margin:16px 0 12px}
.metric-foot{color:var(--muted);font-size:10px}
.metric-primary .metric-foot{color:#a9c4e8}
.trend{color:var(--cyan);font-size:9px;letter-spacing:1px;font-weight:800}
.tiny-indicator{width:7px;height:7px;border-radius:50%;background:var(--green)}
.content-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.panel{padding:20px;min-width:0}
.network-panel{min-height:270px}
.panel-heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;gap:12px}
.panel-icon,.decision-symbol{font-size:20px;color:#8bb8f1}
.chart-summary{display:flex;gap:45px;margin-bottom:7px}
.chart-summary>div{display:grid;gap:5px}
.chart-summary strong{font-size:11px}
.chart-wrap{height:145px;margin-top:5px}
.chart-wrap svg{width:100%;height:100%;overflow:visible}
.chart-grid{stroke:#263951;stroke-width:1;stroke-dasharray:3 7}
.chart-empty{stroke:#38516f;stroke-width:1.3;stroke-dasharray:4 5}
.chart-line{fill:none;stroke:var(--cyan);stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
.chart-area{fill:url(#chartFill)}
.chart-point{fill:var(--cyan);stroke:#0e2534;stroke-width:3}
.chart-label{fill:#657b97;font-size:9px}
.chart-legend{display:flex;justify-content:space-between;color:#70839c;font-size:9px}
.legend-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--cyan);margin-right:5px}
.decision-panel{background:linear-gradient(150deg,#14233a,#101b2d)}
.decision-title{font-size:19px;font-weight:700;letter-spacing:-.4px;margin:5px 0 7px;color:#e8f3ff}
.decision-explanation{min-height:40px}
.decision-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:13px 0;margin:15px 0}
.decision-meta>div{display:grid;gap:5px;min-width:0}
.decision-meta strong{font-size:11px;overflow-wrap:anywhere}
.candidate-list{display:flex;flex-wrap:wrap;gap:7px;margin-top:9px}
.candidate{font-size:10px;padding:5px 8px;border-radius:7px;background:#1b2a40;color:#b6c6db;border:1px solid #2e405a}
.candidate.failed{color:var(--yellow);border-color:#755e32;background:#44341b66}
.module-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
.module-card{background:#0d1726;border:1px solid #203047;border-radius:11px;padding:11px 12px;display:flex;justify-content:space-between;align-items:center;gap:8px}
.module-card strong{font-size:11px;font-weight:600}
.module-card small{display:block;color:var(--muted);font-size:9px;margin-top:4px}
.module-state{font-size:9px;text-transform:uppercase;letter-spacing:.4px}
.issue-summary{display:flex;align-items:baseline;gap:9px;margin:2px 0 12px}
.issue-summary strong{font-size:27px}
.issue-summary span{font-size:10px;color:var(--muted)}
.issue-list{margin:0;padding:0;list-style:none;display:grid;gap:7px;max-height:134px;overflow:auto}
.issue-list li{font-size:11px;color:#c8d3e2;background:#2c251b66;border:1px solid #57452a;border-radius:8px;padding:8px 10px;line-height:1.5}
.posture-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(145,160,182,.12);font-size:11px}
.posture-row:last-of-type{border-bottom:0}
.posture-row>span{color:var(--muted)}
.posture-row strong{font-size:10px;text-align:right;overflow-wrap:anywhere}
.panel-note{font-size:9px;color:#8798ae;line-height:1.55;margin:13px 0 0;padding-top:10px;border-top:1px solid rgba(145,160,182,.12)}
.autopilot-state{display:flex;align-items:center;gap:12px;margin:6px 0 14px;padding:12px;background:#0d1726;border:1px solid #213149;border-radius:11px}
.autopilot-orb{width:12px;height:12px;border-radius:50%;background:var(--yellow);box-shadow:0 0 15px #e7ae4d75}
.autopilot-state strong{display:block;font-size:13px}
.autopilot-state small{display:block;color:var(--muted);font-size:10px;margin-top:3px}
.bottom-grid{display:grid;grid-template-columns:1.35fr 1fr;gap:14px;margin-top:14px}
.compact-panel{padding:17px 20px}
.dependency-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.dependency-grid>div{display:grid;gap:5px}
.dependency-grid strong{font-size:12px}
.dependency-grid small{font-size:9px;color:var(--muted)}
.api-links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.api-links a{border:1px solid #263951;background:#0d1726;border-radius:8px;padding:9px 10px;color:#bdd5f3;text-decoration:none;font-size:10px;display:flex;justify-content:space-between;gap:8px}
.api-links a:hover{border-color:#4779b8;color:#fff}
.raw-details{margin-top:14px;border:1px solid var(--border);background:#0c1421;border-radius:12px;padding:13px 16px;color:#b5c5d9;font-size:11px}
.raw-details summary{cursor:pointer}
.raw-details pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto;color:#9eb4ce;font-size:10px;line-height:1.55}
.error-banner{margin-top:14px;padding:12px 14px;border:1px solid #814047;background:#3b1c25;border-radius:10px;color:#ffc1c5;font-size:11px}
.skeleton-line{height:42px;border-radius:9px;background:linear-gradient(90deg,#152339,#1c2b42,#152339);background-size:200% 100%;animation:shimmer 1.5s infinite}
@keyframes shimmer{to{background-position:-200% 0}}
.footer{display:flex;justify-content:space-between;gap:15px;padding:20px 0 25px;color:#63748d;font-size:9px;border-top:1px solid rgba(145,160,182,.13)}
@media(max-width:900px){.shell{padding:0 22px}.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.content-grid{gap:12px}.bottom-grid{grid-template-columns:1fr}}
@media(max-width:640px){.shell{padding:0 14px}.topbar{height:auto;min-height:70px;align-items:flex-start;padding:15px 0;flex-direction:column}.topbar-actions{width:100%;flex-wrap:wrap}.page-heading{align-items:flex-start;flex-direction:column}.updated-block{text-align:left}.content-grid{grid-template-columns:1fr}.metric-card{padding:14px;min-height:123px}.metric-value strong{font-size:27px}.panel{padding:16px}.dependency-grid{grid-template-columns:1fr 1fr}.dependency-grid>div:last-child{grid-column:span 2}.footer{flex-direction:column}.api-links{grid-template-columns:1fr}.brand-copy{font-size:9px}}
`;

export const dashboardScript = String.raw`
(function () {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const history = [];
  let autoRefresh = true;
  let refreshTimer = null;
  let lastSnapshot = null;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function text(selector, value, fallback) {
    const node = $(selector);
    if (node) node.textContent = value == null || value === '' ? (fallback || '—') : String(value);
  }

  function label(value) {
    if (value == null || value === '') return 'Unknown';
    return String(value).replace(/[-_]/g, ' ').replace(/\b[a-z]/g, function (letter) { return letter.toUpperCase(); });
  }

  function stateClass(value) {
    const status = String(value == null ? '' : value).toLowerCase();
    if (/unhealthy|unavailable|failed|error|down|critical/.test(status)) return 'status-unhealthy';
    if (/degraded|partial|observe|review|not-configured|unknown/.test(status)) return 'status-degraded';
    if (/healthy|available|passed|success|up|closed/.test(status)) return 'status-healthy';
    return 'status-waiting';
  }

  function setChip(selector, value) {
    const node = $(selector);
    if (!node) return;
    node.className = 'status-chip ' + stateClass(value);
    node.textContent = label(value);
  }

  function renderCandidates(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return '<span class="muted">No probe candidates reported.</span>';
    }
    return candidates.map(function (candidate) {
      const accepted = Boolean(candidate && candidate.accepted);
      const name = escapeHtml(candidate && candidate.name ? candidate.name : 'probe');
      const score = Number.isFinite(Number(candidate && candidate.score)) ? ' · ' + Number(candidate.score) + '/100' : '';
      const reason = candidate && candidate.reason ? ' title="' + escapeHtml(candidate.reason) + '"' : '';
      return '<span class="candidate ' + (accepted ? '' : 'failed') + '"' + reason + '>' + name + score + '</span>';
    }).join('');
  }

  function renderModules(data) {
    const modules = [
      ['Network', data.network && (data.network.health || data.network.connection), data.network && data.network.currentRoute],
      ['DNS', data.dns && data.dns.health, data.dns && (data.dns.resolver || 'Resolver')],
      ['Routing', data.routing && data.routing.status, data.routing && data.routing.mode],
      ['Recovery', data.recovery && data.recovery.status, (data.recovery && Array.isArray(data.recovery.issues) ? data.recovery.issues.length : 0) + ' issue(s)'],
      ['Tunnel', data.tunnel && (data.tunnel.activeTunnel ? 'active' : 'not-configured'), data.tunnel && data.tunnel.activeTunnel ? data.tunnel.activeTunnel : 'No active tunnel'],
      ['Observability', data.observability && data.observability.health, data.observability && data.observability.metrics]
    ];
    $('#module-grid').innerHTML = modules.map(function (entry) {
      return '<div class="module-card"><div><strong>' + escapeHtml(entry[0]) + '</strong><small>' + escapeHtml(entry[2] || '—') + '</small></div><span class="module-state ' + stateClass(entry[1]) + '">' + escapeHtml(label(entry[1])) + '</span></div>';
    }).join('');
  }

  function renderIssues(issues) {
    if (!Array.isArray(issues) || issues.length === 0) {
      return '<li style="color:#7cdcb5;background:#12372d;border-color:#285744">No active recovery issues reported.</li>';
    }
    return issues.map(function (issue) {
      const value = typeof issue === 'string' ? issue : (issue && (issue.message || issue.reason || issue.code)) || JSON.stringify(issue);
      return '<li>' + escapeHtml(value) + '</li>';
    }).join('');
  }

  function updateChart(score) {
    if (Number.isFinite(score)) {
      history.push({ time: Date.now(), score: Math.max(0, Math.min(100, score)) });
      if (history.length > 24) history.shift();
    }
    text('#history-count', history.length + ' samples');
    if (history.length < 2) return;
    const width = 640;
    const height = 150;
    const left = 28;
    const right = 10;
    const top = 18;
    const bottom = 10;
    const usableWidth = width - left - right;
    const usableHeight = height - top - bottom;
    const points = history.map(function (point, index) {
      const x = left + (history.length === 1 ? 0 : index / (history.length - 1)) * usableWidth;
      const y = top + (1 - point.score / 100) * usableHeight;
      return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
    });
    const line = points.map(function (point, index) { return (index ? 'L' : 'M') + point.x + ' ' + point.y; }).join(' ');
    const area = line + ' L' + points[points.length - 1].x + ' ' + (height - bottom) + ' L' + points[0].x + ' ' + (height - bottom) + ' Z';
    const last = points[points.length - 1];
    $('#score-chart').innerHTML = '<defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#55d5cf" stop-opacity=".28"/><stop offset="100%" stop-color="#55d5cf" stop-opacity="0"/></linearGradient></defs><path d="M0 18 H640 M0 78 H640 M0 138 H640" class="chart-grid"/><text x="8" y="15" class="chart-label">100</text><text x="8" y="75" class="chart-label">50</text><text x="8" y="142" class="chart-label">0</text><path d="' + area + '" class="chart-area"/><path d="' + line + '" class="chart-line"/><circle cx="' + last.x + '" cy="' + last.y + '" r="5" class="chart-point"/>';
  }

  function render(data) {
    lastSnapshot = data;
    const network = data.network || {};
    const dns = data.dns || {};
    const recovery = data.recovery || {};
    const decision = data.decision || {};
    const security = data.security || {};
    const autopilot = data.autopilot || {};
    const dependencies = data.dependencies || {};
    const observability = data.observability || {};
    const issues = Array.isArray(recovery.issues) ? recovery.issues : [];
    const score = Number(decision.score);

    const global = $('#global-status');
    global.className = 'status-pill ' + stateClass(network.health || network.connection);
    global.innerHTML = '<span class="status-dot"></span>' + escapeHtml(label(network.health || network.connection || 'Unknown'));

    text('#health-score', Number.isFinite(score) ? Math.round(score) : '—');
    text('#health-caption', label(network.health || 'Status unavailable'));
    text('#connection-state', label(network.connection || network.health));
    text('#route-caption', 'Route: ' + (network.currentRoute || 'not reported'));
    text('#current-route', network.currentRoute || 'Not reported');
    text('#dns-latency', Number.isFinite(Number(dns.latencyMs)) ? Math.round(Number(dns.latencyMs)) : '—');
    text('#dns-caption', label(dns.health || 'Resolver status unavailable'));
    text('#incident-count', Number.isFinite(Number(autopilot.activeIncidents)) ? autopilot.activeIncidents : 0);
    text('#approval-caption', 'Approvals pending: ' + (autopilot.pendingApprovals == null ? '0' : autopilot.pendingApprovals));
    text('#decision-title', label(decision.recommendation || 'No recommendation'));
    text('#decision-explanation', decision.explanation || 'No decision explanation was returned.');
    text('#decision-confidence', Number.isFinite(Number(decision.confidence)) ? Math.round(Number(decision.confidence) * 100) + '%' : '—');
    text('#decision-mode', label(decision.mode));
    text('#policy-state', label(decision.policyValidation));
    $('#candidate-list').innerHTML = renderCandidates(decision.candidates);
    renderModules(data);
    text('#issue-count', issues.length);
    $('#issue-list').innerHTML = renderIssues(issues);
    setChip('#network-health-chip', network.health || network.connection);
    setChip('#recovery-chip', recovery.status);
    text('#security-state', label(security.state));
    text('#protection-mode', label(security.protectionState));
    text('#kill-switch', label(security.killSwitch));
    text('#dns-leak', label(security.dnsLeak));
    text('#route-leak', label(security.routeLeak));
    setChip('#autopilot-chip', autopilot.enabled ? autopilot.mode : 'observe-only');
    text('#autopilot-mode', label(autopilot.mode || 'Unknown'));
    text('#autopilot-enabled', autopilot.enabled ? 'Automation enabled' : 'Automation disabled · observe-only');
    text('#active-actions', autopilot.activeActions == null ? 0 : autopilot.activeActions);
    text('#circuit-breaker', label(autopilot.circuitBreaker));
    text('#verification-state', label(autopilot.verificationState));
    text('#rollback-state', label(autopilot.rollbackState));
    text('#database-state', label(dependencies.database));
    text('#database-latency', 'Latency: ' + (data.diagnostics && Number.isFinite(Number(data.diagnostics.databaseLatencyMs)) ? Math.round(Number(data.diagnostics.databaseLatencyMs)) + ' ms' : '—'));
    text('#queue-state', label(dependencies.queue));
    const telemetry = observability.telemetry || {};
    text('#telemetry-state', telemetry.enabled === false ? 'Disabled' : (telemetry.enabled ? 'Enabled' : label(observability.metrics)));
    text('#telemetry-exporter', 'Exporter: ' + (telemetry.exporterConfigured ? 'configured' : 'not configured'));
    text('#last-updated', data.updatedAt ? new Date(data.updatedAt).toLocaleString() : new Date().toLocaleTimeString());
    text('#source-label', 'Source: ' + (data.source || 'API'));
    $('#raw-payload').textContent = JSON.stringify(data, null, 2);
    updateChart(score);
    $('#error-banner').hidden = true;
  }

  async function refresh() {
    const button = $('#refresh-button');
    button.disabled = true;
    button.textContent = 'Refreshing…';
    try {
      const response = await fetch('/api/v1/platform/status', { cache: 'no-store', headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error('Platform status API returned HTTP ' + response.status);
      const payload = await response.json();
      if (!payload || payload.success !== true || !payload.data) throw new Error('Unexpected platform status response shape');
      render(payload.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const banner = $('#error-banner');
      banner.textContent = 'Unable to load live platform status: ' + message + '. Check that the API and database are running, then refresh.';
      banner.hidden = false;
      const global = $('#global-status');
      global.className = 'status-pill status-unhealthy';
      global.innerHTML = '<span class="status-dot"></span>API unavailable';
    } finally {
      button.disabled = false;
      button.innerHTML = '<span aria-hidden="true">↻</span> Refresh';
    }
  }

  function scheduleRefresh() {
    if (refreshTimer) window.clearInterval(refreshTimer);
    if (autoRefresh) refreshTimer = window.setInterval(function () {
      if (!document.hidden) refresh();
    }, 30000);
  }

  $('#refresh-button').addEventListener('click', refresh);
  $('#auto-button').addEventListener('click', function () {
    autoRefresh = !autoRefresh;
    const button = $('#auto-button');
    button.textContent = 'Auto refresh: ' + (autoRefresh ? 'on' : 'off');
    button.setAttribute('aria-pressed', String(autoRefresh));
    button.classList.toggle('button-active', autoRefresh);
    scheduleRefresh();
  });

  refresh();
  scheduleRefresh();
})();
`;