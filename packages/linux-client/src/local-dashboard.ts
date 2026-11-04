/**
 * Linux client local dashboard (presentation only).
 *
 * Rendered server-side from the status the client already computes. The page ships no script (the
 * response CSP is `default-src 'none'; style-src 'unsafe-inline'`), holds no control token and has
 * no state-changing control: autonomy is changed through the authenticated `POST /policy` or the
 * daemon's Unix control socket, and the page says so. Navigation is plain in-page anchors.
 *
 * Visual tokens mirror docs/design/irp-design-tokens.json (enforced by
 * apps/api/src/design-tokens.test.ts). Absent data is shown as "Not reported", never defaulted.
 */
import type { ClientPolicy, LinuxRuntimeStatus, NetworkSnapshot } from './index.js';

export const LOCAL_DASHBOARD_CSS = `
:root{color-scheme:dark light;--bg:#0A0F1C;--surface:#111827;--surface-raised:#172033;--border:#2A3A55;--text:#E8EEF9;--muted:#9AA9C0;--primary:#6AA9FF;--accent:#4FD1C5;--ok:#4ADE9A;--warn:#F5C26B;--danger:#FF7A85;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
@media (prefers-color-scheme:light){:root{--bg:#F4F7FB;--surface:#FFFFFF;--surface-raised:#EEF3F9;--border:#C9D6E6;--text:#0F1B2D;--muted:#4A5B73;--primary:#1D5FD0;--accent:#0B7A75;--ok:#0A7F4F;--warn:#8A5A00;--danger:#B42335}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-size:15px;line-height:1.5;min-width:320px}
h1,h2,h3,p,dl,dd,ul{margin:0}
a{color:var(--primary)}
:focus-visible{outline:3px solid var(--primary);outline-offset:2px;border-radius:6px}
.skip{position:absolute;left:12px;top:-60px;background:var(--primary);color:var(--bg);padding:10px 14px;border-radius:10px;font-weight:600;text-decoration:none}
.skip:focus{top:12px}
header.top{position:sticky;top:0;z-index:5;background:var(--surface);border-bottom:1px solid var(--border)}
.bar{max-width:1120px;margin:0 auto;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:12px}
.mark{width:40px;height:40px;display:grid;place-items:center;border-radius:12px;background:var(--primary);color:var(--bg);font-weight:800}
.brand strong{display:block;font-size:14px;line-height:1.25}
.brand small{display:block;color:var(--muted);font-size:12px}
.actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;min-height:40px;padding:0 16px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font-weight:600;font-size:13px;text-decoration:none}
.btn:hover{border-color:var(--primary);background:var(--surface-raised)}
nav.tabs{max-width:1120px;margin:0 auto;padding:0 24px 8px;display:flex;gap:4px;overflow-x:auto}
nav.tabs a{display:inline-flex;align-items:center;min-height:40px;padding:0 14px;border-radius:10px;color:var(--muted);text-decoration:none;font-weight:500;white-space:nowrap}
nav.tabs a:hover{background:var(--surface-raised);color:var(--text)}
main{max-width:1120px;margin:0 auto;padding:24px;display:grid;gap:32px}
.eyebrow{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--primary);font-weight:700;margin-bottom:4px}
h1{font-size:28px;letter-spacing:-.02em;line-height:1.15}
h2{font-size:20px;letter-spacing:-.01em}
h3{font-size:16px}
.lede{color:var(--muted);margin-top:4px}
section{display:grid;gap:16px;scroll-margin-top:120px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px;min-width:0}
.card.hero{background:var(--surface-raised);border-color:var(--primary)}
.card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px}
.k{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:600}
.v{font-size:28px;font-weight:700;letter-spacing:-.02em;margin:8px 0 4px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.v.word{font-size:22px}
.sub{color:var(--muted);font-size:13px;overflow-wrap:anywhere}
.pill{display:inline-flex;align-items:center;gap:6px;min-height:28px;padding:0 10px;border:1px solid var(--border);border-radius:999px;font-size:13px;font-weight:600;white-space:nowrap;background:var(--surface)}
.pill[data-tone="ok"],.t[data-tone="ok"]{color:var(--ok)}
.pill[data-tone="warn"],.t[data-tone="warn"]{color:var(--warn)}
.pill[data-tone="danger"],.t[data-tone="danger"]{color:var(--danger)}
.pill[data-tone="observing"],.t[data-tone="observing"]{color:var(--primary)}
.pill[data-tone="unknown"],.t[data-tone="unknown"]{color:var(--muted)}
.t{font-weight:600}
dl.kv{display:grid}
dl.kv>div{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid var(--border)}
dl.kv>div:last-child{border-bottom:0}
dl.kv dt{color:var(--muted);font-size:14px}
dl.kv dd{font-weight:600;font-size:14px;text-align:right;overflow-wrap:anywhere}
ul.list{list-style:none;padding:0;display:grid;gap:8px}
ul.list li{padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface-raised);font-size:14px;overflow-wrap:anywhere}
ul.list li[data-tone="warn"]{border-color:var(--warn)}
.empty{padding:16px;border:1px dashed var(--border);border-radius:10px;color:var(--muted);font-size:14px}
.unavail{padding:12px 14px;border:1px solid var(--warn);border-radius:10px;color:var(--warn);font-size:14px;overflow-wrap:anywhere}
pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto;font-size:12px;line-height:1.6;color:var(--muted);background:var(--surface-raised);border:1px solid var(--border);border-radius:10px;padding:12px}
details.raw>summary{cursor:pointer;font-weight:600;min-height:28px}
details.raw[open]>summary{margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--border);vertical-align:top}
th{color:var(--muted);font-size:12px;letter-spacing:.06em;text-transform:uppercase;font-weight:600}
.scroll{overflow-x:auto}
.note{color:var(--muted);font-size:13px;border-top:1px solid var(--border);padding-top:12px;margin-top:12px}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em;background:var(--surface-raised);padding:1px 6px;border-radius:6px}
footer{max-width:1120px;margin:0 auto;padding:16px 24px 32px;color:var(--muted);font-size:12px;border-top:1px solid var(--border)}
@media (max-width:560px){.bar,main,nav.tabs,footer{padding-left:16px;padding-right:16px}h1{font-size:24px}.cards{grid-template-columns:1fr}}
`;

export type Tone = 'ok' | 'warn' | 'danger' | 'observing' | 'unknown';
const GLYPH: Record<Tone, string> = { ok: '●', warn: '▲', danger: '■', observing: '◆', unknown: '○' };
const NOT_REPORTED = 'Not reported';

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function label(value: unknown): string {
  if (value === undefined || value === null || value === '') return NOT_REPORTED;
  const words = String(value).replace(/[-_]+/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function healthTone(value: unknown): Tone {
  switch (String(value ?? '').toLowerCase()) {
    case 'healthy':
    case 'live':
      return 'ok';
    case 'degraded':
      return 'warn';
    case 'failed':
    case 'unavailable':
      return 'danger';
    case 'simulation':
    case 'simulation-only':
    case 'safe':
      return 'observing';
    default:
      return 'unknown';
  }
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return NOT_REPORTED;
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export const pill = (tone: Tone, text: string): string =>
  `<span class="pill" data-tone="${tone}"><span aria-hidden="true">${GLYPH[tone]}</span>${escapeHtml(text)}</span>`;
export const toned = (tone: Tone, text: string): string =>
  `<span class="t" data-tone="${tone}"><span aria-hidden="true">${GLYPH[tone]}</span> ${escapeHtml(text)}</span>`;
const kpi = (title: string, value: string, sub: string, hero = false, word = false): string =>
  `<article class="card${hero ? ' hero' : ''}"><p class="k">${escapeHtml(title)}</p><p class="v${word ? ' word' : ''}">${escapeHtml(value)}</p><p class="sub">${escapeHtml(sub)}</p></article>`;
const row = (name: string, valueHtml: string): string => `<div><dt>${escapeHtml(name)}</dt><dd>${valueHtml}</dd></div>`;
const yesNo = (value: boolean | null | undefined): string =>
  value === true ? toned('ok', 'Yes') : value === false ? toned('unknown', 'No') : toned('unknown', 'Unknown');
const count = (value: unknown): string => (typeof value === 'number' && Number.isFinite(value) ? String(value) : NOT_REPORTED);

/** `unavailable: ...` is how the system adapter reports a command it could not run. */
export const isUnavailable = (text: string): boolean => text.trimStart().startsWith('unavailable:');

function diagnostic(title: string, body: string): string {
  const content = isUnavailable(body)
    ? `<p class="unavail">${pill('warn', 'Unavailable')} ${escapeHtml(body.replace(/^\s*unavailable:\s*/, ''))}</p>`
    : body.trim() === ''
      ? '<p class="empty">The command returned no output.</p>'
      : `<pre>${escapeHtml(body)}</pre>`;
  return `<article class="card"><div class="card-head"><h3>${escapeHtml(title)}</h3></div>${content}</article>`;
}

export function renderLinuxDashboard(
  snapshot: NetworkSnapshot,
  policy: ClientPolicy,
  status: LinuxRuntimeStatus,
): string {
  const runtime = status.runtime;
  const health = runtime.health;
  const auth = status.authorization;
  const counters = runtime.counters;
  const scheduler = status.scheduler;
  const cycle = status.lastAutonomyCycle;
  const recovery = status.routeRecovery;

  const overview = `<section id="overview" aria-labelledby="overview-h">
<div><p class="eyebrow">Linux full client</p><h1 id="overview-h">Overview</h1><p class="lede">Runtime state, tunnel, host authority and network diagnostics for this machine.</p></div>
<div class="kpis">
${kpi('Runtime health', label(health.status), health.reason || 'No reason reported', true, true)}
${kpi('Runtime state', label(runtime.state), `Mode: ${label(runtime.mode)}`, false, true)}
${kpi('Uptime', formatDuration(runtime.uptimeMs), 'Since the runtime started', false, true)}
${kpi('Autonomous mode', policy.autonomousMode ? 'Enabled' : 'Disabled', policy.autonomousMode ? 'Policy allows autonomous cycles' : 'Observe and advise only', false, true)}
</div></section>`;

  const network = `<section id="network" aria-labelledby="network-h">
<div><p class="eyebrow">Connectivity</p><h2 id="network-h">Network diagnostics</h2><p class="lede">Captured ${escapeHtml(snapshot.capturedAt)} from the host; shown exactly as the system tools reported it.</p></div>
<div class="cards">
${diagnostic('Interfaces', snapshot.interfaces)}
${diagnostic('Routes', snapshot.routes)}
${diagnostic('DNS', snapshot.dns)}
</div></section>`;

  const tunnelState = status.tunnelActive ? pill('ok', 'Active') : status.tunnelConfigured ? pill('warn', 'Configured, not active') : pill('unknown', 'Not configured');
  const tunnel = `<section id="tunnel" aria-labelledby="tunnel-h">
<div><p class="eyebrow">Encrypted path</p><h2 id="tunnel-h">Tunnel</h2></div>
<article class="card"><div class="card-head"><h3>WireGuard</h3>${tunnelState}</div>
<dl class="kv">
${row('Configured', yesNo(status.tunnelConfigured))}
${row('Active', yesNo(status.tunnelActive))}
${row('Active tunnel', escapeHtml(status.activeTunnel ?? 'None'))}
${row('Managed tunnel', escapeHtml(status.managedTunnel ?? 'None'))}
</dl>
${status.tunnelConfigured ? '' : '<p class="empty">No tunnel is configured for this client, so none is managed or reported.</p>'}
</article></section>`;

  const evidence = auth?.evidence;
  const blockers = auth?.blockers ?? [];
  const security = `<section id="security" aria-labelledby="security-h">
<div><p class="eyebrow">Host authority</p><h2 id="security-h">Security</h2><p class="lede">Live changes are granted only from facts the host proves, not from configuration alone.</p></div>
<div class="cards">
<article class="card"><div class="card-head"><h3>Authorization</h3>${auth ? (auth.liveActive ? pill('ok', 'Live active') : pill('observing', 'Safe mode')) : pill('unknown', NOT_REPORTED)}</div>
${auth ? `<dl class="kv">
${row('Live requested', yesNo(auth.requestedLive))}
${row('Effective mode', escapeHtml(label(auth.effectiveMode)))}
${row('Live active', yesNo(auth.liveActive))}
${row('Tunnel active', yesNo(auth.tunnelActive))}
</dl>` : '<p class="empty">The client did not report host authorization.</p>'}
</article>
<article class="card"><div class="card-head"><h3>Host evidence</h3></div>
${evidence ? `<dl class="kv">
${row('Platform', escapeHtml(evidence.platform))}
${row('Effective UID', escapeHtml(evidence.euid ?? 'Unknown'))}
${row('CAP_NET_ADMIN', yesNo(evidence.capNetAdmin))}
${row('ip (iproute2)', yesNo(evidence.ipBinary))}
${row('wg binary', yesNo(evidence.wireGuardBinary))}
${row('Credentials directory', yesNo(evidence.credentialsDirectory))}
</dl>` : '<p class="empty">No host evidence was reported.</p>'}
</article>
</div>
${blockers.length > 0 ? `<article class="card"><div class="card-head"><h3>Why live changes are blocked</h3>${pill('warn', `${blockers.length} blocker${blockers.length === 1 ? '' : 's'}`)}</div><ul class="list">${blockers.map((b) => `<li data-tone="warn">▲ ${escapeHtml(b)}</li>`).join('')}</ul></article>` : auth ? '<article class="card"><p class="t" data-tone="ok">● No authorization blockers reported.</p></article>' : ''}
</section>`;

  const automation = `<section id="automation" aria-labelledby="automation-h">
<div><p class="eyebrow">Resilience engine</p><h2 id="automation-h">Automation</h2></div>
<div class="cards">
<article class="card"><div class="card-head"><h3>Autonomy</h3>${policy.autonomousMode ? pill('ok', 'Enabled') : pill('observing', 'Observe only')}</div>
<dl class="kv">
${row('Autonomous mode', escapeHtml(policy.autonomousMode ? 'Enabled' : 'Disabled'))}
${row('Runtime mode', escapeHtml(label(runtime.mode)))}
${row('Last autonomy cycle', cycle ? toned(healthTone(cycle.status === 'healthy' ? 'healthy' : cycle.status === 'failed' ? 'failed' : 'degraded'), label(cycle.status)) : escapeHtml('No cycle has run'))}
${cycle ? row('Stop reason', escapeHtml(label(cycle.stopReason))) : ''}
${cycle ? row('Cycles completed', escapeHtml(cycle.cyclesCompleted)) : ''}
</dl>
<p class="note">This page is read-only. Change autonomous mode with an authenticated <code>POST /policy</code> (JSON body, bearer token from the control token file); the daemon's Unix control socket is the canonical control interface.</p>
</article>
<article class="card"><div class="card-head"><h3>Scheduler</h3>${scheduler ? (scheduler.enabled ? pill('ok', scheduler.active ? 'Running' : 'Idle') : pill('unknown', 'Disabled')) : pill('unknown', NOT_REPORTED)}</div>
${scheduler ? `<dl class="kv">
${row('Runs', escapeHtml(count(scheduler.runsTotal)))}
${row('Skipped', escapeHtml(count(scheduler.skippedTotal)))}
${row('Overlap prevented', escapeHtml(count(scheduler.overlapPreventedTotal)))}
${row('Failed', escapeHtml(count(scheduler.failedTotal)))}
${scheduler.lastFailure ? row('Last failure', escapeHtml(String(scheduler.lastFailure))) : ''}
</dl>` : '<p class="empty">No scheduler is attached to this runtime.</p>'}
</article>
<article class="card"><div class="card-head"><h3>Route recovery at startup</h3>${recovery ? (recovery.failed.length > 0 || recovery.corrupt.length > 0 ? pill('danger', 'Needs attention') : pill('ok', 'Clean')) : pill('unknown', 'Not run')}</div>
${recovery ? `<dl class="kv">
${row('Rolled back', escapeHtml(recovery.rolledBack.length))}
${row('Failed', escapeHtml(recovery.failed.length))}
${row('Pruned', escapeHtml(recovery.pruned.length))}
${row('Corrupt journal entries', escapeHtml(recovery.corrupt.length))}
</dl>${recovery.failed.length > 0 ? `<ul class="list">${recovery.failed.map((f) => `<li data-tone="warn">▲ ${escapeHtml(f.planId)}: ${escapeHtml(f.error)}</li>`).join('')}</ul>` : ''}` : '<p class="empty">No route journal recovery has been reported for this run.</p>'}
</article>
</div></section>`;

  const capabilities = status.capabilityStatus;
  const diagnostics = `<section id="diagnostics" aria-labelledby="diagnostics-h">
<div><p class="eyebrow">Health and support</p><h2 id="diagnostics-h">Diagnostics</h2></div>
<article class="card"><div class="card-head"><h3>Runtime counters</h3></div>
<dl class="kv">
${row('Cycles', escapeHtml(count(counters.cyclesTotal)))}
${row('Failed cycles', escapeHtml(count(counters.cyclesFailedTotal)))}
${row('Decisions', escapeHtml(count(counters.decisionsTotal)))}
${row('Actions', escapeHtml(count(counters.actionsTotal)))}
${row('Failed actions', escapeHtml(count(counters.actionsFailedTotal)))}
${row('Failed verifications', escapeHtml(count(counters.verificationsFailedTotal)))}
${row('Recoveries', escapeHtml(count(counters.recoveriesTotal)))}
${row('Rollbacks', escapeHtml(count(counters.rollbacksTotal)))}
${row('Blocked', escapeHtml(count(counters.blockedTotal)))}
${row('Degraded', escapeHtml(count(counters.degradedTotal)))}
</dl></article>
<article class="card"><div class="card-head"><h3>Adapter capabilities</h3></div>
${capabilities.length === 0 ? '<p class="empty">No adapters are registered.</p>' : `<div class="scroll"><table><thead><tr><th>Adapter</th><th>Subsystem</th><th>Status</th><th>Verify</th><th>Recover</th></tr></thead><tbody>${capabilities.map((c) => `<tr><td>${escapeHtml(c.adapterId)}</td><td>${escapeHtml(c.subsystem)}</td><td>${toned(healthTone(c.status), label(c.status))}</td><td>${yesNo(c.verificationSupport)}</td><td>${yesNo(c.recoverySupport)}</td></tr>`).join('')}</tbody></table></div>`}
<p class="note">Simulation-only adapters can plan and verify but never change the host.</p></article>
<article class="card"><details class="raw"><summary>Raw runtime status</summary><pre>${escapeHtml(JSON.stringify(status, null, 2))}</pre></details></article>
</section>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light">
<title>IRP Linux Client</title><style>${LOCAL_DASHBOARD_CSS}</style></head>
<body><a class="skip" href="#overview">Skip to content</a>
<header class="top"><div class="bar"><div class="brand"><span class="mark" aria-hidden="true">IR</span><div><strong>Internet Resilience Platform</strong><small>Linux Full Client</small></div></div>
<div class="actions">${pill(healthTone(health.status), `Runtime ${label(health.status).toLowerCase()}`)}<a class="btn" href="/">Reload</a></div></div>
<nav class="tabs" aria-label="Sections"><a href="#overview">Overview</a><a href="#network">Connectivity</a><a href="#tunnel">Tunnel</a><a href="#security">Security</a><a href="#automation">Automation</a><a href="#diagnostics">Diagnostics</a></nav></header>
<main>${overview}${network}${tunnel}${security}${automation}${diagnostics}</main>
<footer>IRP Linux Client · Local, read-only view · Data refreshes on reload</footer>
</body></html>`;
}
