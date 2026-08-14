import type { PlatformBridge } from '../preload/preload.js';
import type {
  DecisionResponse,
  DnsStatusResponse,
  NetworkStatusResponse,
  SecurityStatusResponse,
  SettingsResponse,
  SystemInfoResponse,
  TunnelStatusResponse,
} from '../shared/ipc-contracts.js';
declare global {
  interface Window {
    platform: PlatformBridge;
  }
}
type Page =
  | 'Dashboard'
  | 'Network'
  | 'Security'
  | 'Tunnels'
  | 'DNS'
  | 'Decisions'
  | 'Settings'
  | 'Diagnostics';
const pages: Page[] = [
  'Dashboard',
  'Network',
  'Security',
  'Tunnels',
  'DNS',
  'Decisions',
  'Settings',
  'Diagnostics',
];
let current: Page = 'Dashboard';
const snapshot: {
  network?: NetworkStatusResponse;
  security?: SecurityStatusResponse;
  tunnel?: TunnelStatusResponse;
  dns?: DnsStatusResponse;
  decision?: DecisionResponse;
  settings?: SettingsResponse;
  system?: SystemInfoResponse;
} = {};
const scenarios = [
  'healthy',
  'degraded',
  'tunnel-failure',
  'dns-leak',
  'route-leak',
  'failover',
  'ai-recommendation',
] as const;
async function unwrap<T>(
  p: Promise<{ ok: true; data: T } | { ok: false; error: { message: string } }>,
): Promise<T | undefined> {
  const r = await p;
  if (r.ok) return r.data;
  notify('error', r.error.message);
}
function badge(v?: string) {
  return `<span class="badge ${v}">${v ?? 'UNAVAILABLE'}</span>`;
}
function card(title: string, body: string, source = 'UNAVAILABLE') {
  return `<section class="card"><div class="card-title"><h3>${title}</h3>${badge(source)}</div>${body}</section>`;
}
function metric(label: string, value: unknown) {
  return `<div class="metric"><span>${label}</span><strong>${value ?? 'Unavailable'}</strong></div>`;
}
function table(headers: string[], rows: unknown[][]) {
  return `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c ?? '—'}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function notify(kind: string, message: string) {
  const area = document.querySelector('.toasts');
  if (area && !area.textContent?.includes(message))
    area.insertAdjacentHTML(
      'beforeend',
      `<div class="toast ${kind}" role="status">${message}</div>`,
    );
}
async function refresh() {
  const [network, security, tunnel, dns, decision, settings, system] = await Promise.all([
    unwrap(window.platform.network.getStatus()),
    unwrap(window.platform.security.getStatus()),
    unwrap(window.platform.tunnel.getStatus()),
    unwrap(window.platform.dns.getStatus()),
    unwrap(window.platform.ai.getDecision()),
    unwrap(window.platform.settings.get()),
    unwrap(window.platform.system.getInfo()),
  ]);
  if (network) snapshot.network = network;
  if (security) snapshot.security = security;
  if (tunnel) snapshot.tunnel = tunnel;
  if (dns) snapshot.dns = dns;
  if (decision) snapshot.decision = decision;
  if (settings) snapshot.settings = settings;
  if (system) snapshot.system = system;
  render();
}
function pageContent() {
  const {
    network: n,
    security: s,
    tunnel: t,
    dns: d,
    decision: a,
    settings: set,
    system: sys,
  } = snapshot;
  if (current === 'Dashboard')
    return `<div class="grid">${card('Connection', metric('State', n?.connection) + metric('Route', n?.currentRoute) + metric('Health', n?.health), n?.source)}${card('Tunnel', metric('Active', t?.activeTunnel) + metric('Count', t?.tunnels.length), t?.source)}${card('DNS', metric('Resolver', d?.resolver) + metric('Transport', d?.secureTransport) + metric('Leak', d?.leakStatus), d?.source)}${card('Security', metric('Protection', s?.protectionState) + metric('Kill switch', s?.killSwitch) + `<p>${s?.explanation ?? 'Unavailable'}</p>`, s?.source)}${card('AI recommendation', metric('Recommendation', a?.recommendation) + metric('Confidence', a?.confidence) + `<p>${a?.explanation ?? 'Unavailable'}</p>`, a?.source)}</div>`;
  if (current === 'Network')
    return card(
      'Network status',
      metric('Connection', n?.connection) +
        table(
          ['Interface', 'State', 'Latency', 'Packet loss'],
          n?.interfaces.map((i) => [i.name, i.state, i.latencyMs, i.packetLossPct]) ?? [],
        ),
      n?.source,
    );
  if (current === 'Security')
    return card(
      'Security protection',
      metric('State', s?.state) +
        metric('Kill switch', s?.killSwitch) +
        metric('Route leak', s?.routeLeak) +
        metric('DNS leak', s?.dnsLeak) +
        metric('IPv6', s?.ipv6) +
        `<p>${s?.explanation}</p>${table(['Violation'], s?.violations.map((v) => [v]) ?? [])}`,
      s?.source,
    );
  if (current === 'Tunnels')
    return card(
      'Tunnel layer',
      metric('Active tunnel', t?.activeTunnel) +
        table(
          ['Name', 'Status', 'Endpoint', 'Latency', 'Duration'],
          t?.tunnels.map((x) => [x.name, x.status, x.endpoint, x.latencyMs, x.durationSeconds]) ??
            [],
        ),
      t?.source,
    );
  if (current === 'DNS')
    return card(
      'DNS engine',
      metric('Resolver', d?.resolver) +
        metric('Secure transport', d?.secureTransport) +
        metric('Health', d?.health) +
        metric('Latency', d?.latencyMs) +
        metric('Policy', d?.policyStatus) +
        metric('Leak', d?.leakStatus),
      d?.source,
    );
  if (current === 'Decisions')
    return card(
      'AI decision state',
      metric('Recommendation', a?.recommendation) +
        metric('Mode', a?.mode) +
        metric('Score', a?.score) +
        metric('Confidence', a?.confidence) +
        metric('Policy validation', a?.policyValidation) +
        metric('Security validation', a?.securityValidation) +
        table(
          ['Candidate', 'Score', 'Accepted', 'Reason'],
          a?.candidates.map((c) => [c.name, c.score, c.accepted, c.reason]) ?? [],
        ),
      a?.source,
    );
  if (current === 'Settings')
    return `<div class="grid">${
      set?.sections
        .map((sec) =>
          card(
            sec.name,
            table(
              ['Key', 'Value', 'Consequence', 'Confirm'],
              sec.settings.map((x) => [x.key, x.value, x.consequence, x.requiresConfirmation]),
            ),
            set.source,
          ),
        )
        .join('') ?? card('Settings', 'Unavailable')
    }</div>`;
  return card(
    'Diagnostics',
    metric('Version', sys?.appVersion) +
      metric('Platform', sys?.platform) +
      metric('Architecture', sys?.arch) +
      metric('Backend', sys?.backendStatus) +
      metric('IPC', sys?.ipcStatus) +
      `<button id="export">Export diagnostics</button>`,
    sys?.source,
  );
}
function render() {
  document.querySelector('#app')!.innerHTML =
    `<aside class="sidebar"><h1>IRP</h1><div class="demo">${snapshot.network?.source ?? 'LIVE'} MODE</div>${pages.map((p) => `<button class="nav ${p === current ? 'active' : ''}" data-page="${p}">${p}</button>`).join('')}</aside><main><header><div><strong>${current}</strong><span>${snapshot.network?.connection ?? 'unavailable'}</span></div><div>${badge(snapshot.network?.source)} ${badge(snapshot.security?.state)} <select id="scenario">${scenarios.map((s) => `<option>${s}</option>`).join('')}</select><button id="theme">Toggle theme</button></div></header><section class="content">${pageContent()}</section><div class="toasts"></div></main>`;
  document.querySelectorAll('.nav').forEach((b) =>
    b.addEventListener('click', () => {
      current = (b as HTMLElement).dataset.page as Page;
      render();
    }),
  );
  document
    .querySelector('#theme')
    ?.addEventListener('click', () => document.body.classList.toggle('light'));
  document.querySelector('#scenario')?.addEventListener('change', async (e) => {
    await window.platform.demo.setScenario((e.target as HTMLSelectElement).value as never);
    await refresh();
  });
  document.querySelector('#export')?.addEventListener('click', async () => {
    await window.platform.diagnostics.export();
    notify('success', 'Sanitized diagnostic bundle generated.');
  });
}
window.platform.events.subscribe((event) => {
  notify(
    event.name.includes('security') ? 'security' : 'info',
    `${event.name} from ${event.source}`,
  );
  void refresh();
});
void refresh();
