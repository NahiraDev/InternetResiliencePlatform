export const LOCAL_DASHBOARD_CSS = `
:root{color-scheme:dark light;--bg:#0A0F1C;--surface:#111827;--surface-raised:#172033;--border:#2A3A55;--text:#E8EEF9;--muted:#9AA9C0;--primary:#6AA9FF;--accent:#4FD1C5;--ok:#4ADE9A;--warn:#F5C26B;--danger:#FF7A85;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",Inter,ui-sans-serif,system-ui,"Segoe UI",Roboto,sans-serif}
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
ul.list li{display:flex;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface-raised);font-size:14px;overflow-wrap:anywhere}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{font-size:13px;padding:6px 10px;border-radius:8px;background:var(--surface-raised);border:1px solid var(--border);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.empty{padding:16px;border:1px dashed var(--border);border-radius:10px;color:var(--muted);font-size:14px}
.banner{padding:12px 16px;border:1px solid var(--warn);border-radius:10px;color:var(--warn);font-size:14px}
.unavail{padding:12px 14px;border:1px solid var(--warn);border-radius:10px;color:var(--warn);font-size:14px;overflow-wrap:anywhere}
pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto;font-size:12px;line-height:1.6;color:var(--muted);background:var(--surface-raised);border:1px solid var(--border);border-radius:10px;padding:12px}
details.raw>summary{cursor:pointer;font-weight:600;min-height:28px}
details.raw[open]>summary{margin-bottom:12px}
.note{color:var(--muted);font-size:13px;border-top:1px solid var(--border);padding-top:12px;margin-top:12px}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em;background:var(--surface-raised);padding:1px 6px;border-radius:6px}
footer{max-width:1120px;margin:0 auto;padding:16px 24px 32px;color:var(--muted);font-size:12px;border-top:1px solid var(--border)}
@media (max-width:560px){.bar,main,nav.tabs,footer{padding-left:16px;padding-right:16px}h1{font-size:24px}.cards{grid-template-columns:1fr}}
`;
const GLYPH = { ok: '●', warn: '▲', danger: '■', observing: '◆', unknown: '○' };
const NOT_REPORTED = 'Not reported';
export function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
export const isUnavailable = (text) => text.trimStart().startsWith('unavailable:');
const pill = (tone, text) => `<span class="pill" data-tone="${tone}"><span aria-hidden="true">${GLYPH[tone]}</span>${escapeHtml(text)}</span>`;
const toned = (tone, text) => `<span class="t" data-tone="${tone}"><span aria-hidden="true">${GLYPH[tone]}</span> ${escapeHtml(text)}</span>`;
const kpi = (title, value, sub, hero = false) => `<article class="card${hero ? ' hero' : ''}"><p class="k">${escapeHtml(title)}</p><p class="v word">${escapeHtml(value)}</p><p class="sub">${escapeHtml(sub)}</p></article>`;
const row = (name, valueHtml) => `<div><dt>${escapeHtml(name)}</dt><dd>${valueHtml}</dd></div>`;
/** Reads `route -n get default`: lines such as `gateway: 192.0.2.1` and `interface: en0`. */
export function parseDefaultRoute(text) {
    if (isUnavailable(text))
        return {};
    const field = (name) => {
        const match = new RegExp(`^\\s*${name}:\\s*(\\S+)\\s*$`, 'm').exec(text);
        return match?.[1];
    };
    const gateway = field('gateway');
    const iface = field('interface');
    return { ...(gateway ? { gateway } : {}), ...(iface ? { interface: iface } : {}) };
}
/** Reads `networksetup -listallnetworkservices`; a leading `*` marks a disabled service. */
export function parseNetworkServices(text) {
    if (isUnavailable(text))
        return [];
    return text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '' && !/^an asterisk/i.test(line))
        .map((line) => (line.startsWith('*') ? { name: line.slice(1).trim(), enabled: false } : { name: line, enabled: true }))
        .filter((entry) => entry.name !== '');
}
/** Reads `scutil --nc list`: `* (Connected)  <uuid> VPN (<type>) "Name"  [VPN:<type>]`. */
export function parseVpnServices(text) {
    if (isUnavailable(text))
        return [];
    const entries = [];
    for (const line of text.split('\n')) {
        const state = /^\s*\*?\s*\(([^)]+)\)/.exec(line)?.[1];
        if (!state)
            continue;
        const quoted = [...line.matchAll(/"([^"]*)"/g)].at(-1)?.[1];
        entries.push({ name: quoted && quoted !== '' ? quoted : line.trim(), state: state.trim() });
    }
    return entries;
}
/** Reads `ifconfig`: a header `en0: flags=...<UP,...>` and an optional `status: active` line. */
export function parseInterfaces(text) {
    if (isUnavailable(text))
        return [];
    const entries = [];
    for (const line of text.split('\n')) {
        const header = /^([A-Za-z0-9._-]+):\s+flags=\w+<([^>]*)>/.exec(line);
        if (header?.[1] !== undefined) {
            entries.push({ name: header[1], up: (header[2] ?? '').split(',').includes('UP') });
            continue;
        }
        const status = /^\s+status:\s*(\S.*)$/.exec(line)?.[1];
        const current = entries.at(-1);
        if (status && current)
            current.status = status.trim();
    }
    return entries;
}
/** Unique resolver addresses from `scutil --dns` (`nameserver[0] : 1.1.1.1`), in order of appearance. */
export function parseDnsServers(text) {
    if (isUnavailable(text))
        return [];
    const seen = new Set();
    for (const match of text.matchAll(/nameserver\[\d+\]\s*:\s*(\S+)/g))
        if (match[1])
            seen.add(match[1]);
    return [...seen];
}
const rawDetails = (title, body) => isUnavailable(body)
    ? `<article class="card"><div class="card-head"><h3>${escapeHtml(title)}</h3>${pill('warn', 'Unavailable')}</div><p class="unavail">${escapeHtml(body.replace(/^\s*unavailable:\s*/, ''))}</p></article>`
    : `<article class="card"><details class="raw"><summary>${escapeHtml(title)} (raw)</summary>${body.trim() === '' ? '<p class="empty">The command returned no output.</p>' : `<pre>${escapeHtml(body)}</pre>`}</details></article>`;
export function renderMacOSDashboard(snapshot, policy) {
    const supported = snapshot.platform === 'darwin';
    const route = parseDefaultRoute(snapshot.routes);
    const interfaces = parseInterfaces(snapshot.interfaces);
    const services = parseNetworkServices(snapshot.networkServices);
    const vpns = parseVpnServices(snapshot.vpnServices);
    const dnsServers = parseDnsServers(snapshot.dns);
    const connectedVpns = vpns.filter((v) => /^connected$/i.test(v.state)).length;
    const activeInterfaces = interfaces.filter((i) => i.up && (i.status === undefined || /^active$/i.test(i.status)));
    const routeValue = route.gateway ? `via ${route.gateway}` : supported ? 'No default route' : NOT_REPORTED;
    const platformBanner = supported
        ? ''
        : `<p class="banner" role="status">${pill('warn', 'Not running on macOS')} Network diagnostics need macOS system tools. This host reports "${escapeHtml(process.platform)}", so the values below are unavailable rather than empty.</p>`;
    const overview = `<section id="overview" aria-labelledby="overview-h">
<div><p class="eyebrow">macOS full client</p><h1 id="overview-h">Overview</h1><p class="lede">Network state, VPN services and policy for this Mac.</p></div>
${platformBanner}
<div class="kpis">
${kpi('Platform', supported ? 'macOS' : 'Unsupported', `Captured ${snapshot.capturedAt}`, true)}
${kpi('Default route', routeValue, route.interface ? `Interface ${route.interface}` : 'No interface reported')}
${kpi('VPN services', supported ? String(vpns.length) : NOT_REPORTED, supported ? `${connectedVpns} connected` : 'Needs macOS')}
${kpi('Autonomous mode', policy.autonomousMode ? 'Enabled' : 'Disabled', policy.autonomousMode ? 'Policy allows autonomous cycles' : 'Observe and advise only')}
</div></section>`;
    const connectivity = `<section id="network" aria-labelledby="network-h">
<div><p class="eyebrow">Connectivity</p><h2 id="network-h">Network</h2></div>
<div class="cards">
<article class="card"><div class="card-head"><h3>Default route</h3>${route.gateway ? pill('ok', 'Present') : supported ? pill('warn', 'None') : pill('unknown', NOT_REPORTED)}</div>
${isUnavailable(snapshot.routes) ? `<p class="unavail">${escapeHtml(snapshot.routes.replace(/^\s*unavailable:\s*/, ''))}</p>` : `<dl class="kv">${row('Gateway', escapeHtml(route.gateway ?? NOT_REPORTED))}${row('Interface', escapeHtml(route.interface ?? NOT_REPORTED))}</dl>`}
</article>
<article class="card"><div class="card-head"><h3>DNS resolvers</h3>${dnsServers.length > 0 ? pill('ok', `${dnsServers.length} found`) : pill('unknown', NOT_REPORTED)}</div>
${dnsServers.length > 0 ? `<div class="chips">${dnsServers.map((s) => `<span class="chip">${escapeHtml(s)}</span>`).join('')}</div>` : `<p class="empty">${supported ? 'No resolver addresses were found in the DNS configuration.' : 'DNS configuration is read with scutil on macOS.'}</p>`}
</article>
</div>
<article class="card"><div class="card-head"><h3>Interfaces</h3>${interfaces.length > 0 ? pill('ok', `${activeInterfaces.length} active of ${interfaces.length}`) : pill('unknown', NOT_REPORTED)}</div>
${interfaces.length > 0 ? `<ul class="list">${interfaces.map((i) => `<li><strong>${escapeHtml(i.name)}</strong>${i.up ? (i.status && !/^active$/i.test(i.status) ? toned('warn', label(i.status)) : toned('ok', i.status ? 'Active' : 'Up')) : toned('unknown', 'Down')}</li>`).join('')}</ul>` : `<p class="empty">${supported ? 'No interfaces were parsed from ifconfig output; see the raw output in Diagnostics.' : 'Interfaces are read with ifconfig on macOS.'}</p>`}
</article></section>`;
    const tunnel = `<section id="tunnel" aria-labelledby="tunnel-h">
<div><p class="eyebrow">Encrypted path</p><h2 id="tunnel-h">VPN services</h2></div>
<article class="card"><div class="card-head"><h3>Configured in System Settings</h3>${vpns.length > 0 ? (connectedVpns > 0 ? pill('ok', `${connectedVpns} connected`) : pill('observing', 'None connected')) : pill('unknown', 'None configured')}</div>
${vpns.length > 0 ? `<ul class="list">${vpns.map((v) => `<li><strong>${escapeHtml(v.name)}</strong>${/^connected$/i.test(v.state) ? toned('ok', 'Connected') : /^connecting$/i.test(v.state) ? toned('warn', 'Connecting') : toned('unknown', label(v.state))}</li>`).join('')}</ul>` : `<p class="empty">${isUnavailable(snapshot.vpnServices) ? escapeHtml(snapshot.vpnServices.replace(/^\s*unavailable:\s*/, '')) : 'No VPN services are configured on this Mac.'}</p>`}
<p class="note">The client lists VPN services; it does not connect, disconnect or edit them.</p></article></section>`;
    const security = `<section id="security" aria-labelledby="security-h">
<div><p class="eyebrow">Boundary</p><h2 id="security-h">Security</h2></div>
<article class="card"><div class="card-head"><h3>Control access</h3>${pill('observing', 'Read-only page')}</div>
<dl class="kv">${row('Network changes', escapeHtml('None: the client reads state and stores the autonomous-mode flag only'))}${row('Policy changes', escapeHtml('Authenticated POST /policy (bearer token)'))}${row('Listener', escapeHtml('Loopback only'))}</dl>
<p class="note">Routing, DNS and gateway decisions stay with the IRP Control Plane.</p></article></section>`;
    const automation = `<section id="automation" aria-labelledby="automation-h">
<div><p class="eyebrow">Resilience engine</p><h2 id="automation-h">Automation</h2></div>
<article class="card"><div class="card-head"><h3>Autonomy</h3>${policy.autonomousMode ? pill('ok', 'Enabled') : pill('observing', 'Observe only')}</div>
<dl class="kv">${row('Autonomous mode', escapeHtml(policy.autonomousMode ? 'Enabled' : 'Disabled'))}${row('Preferred interface', escapeHtml(policy.preferredInterface ?? 'None set'))}</dl>
<p class="note">This page is read-only. Changing autonomous mode requires an authenticated JSON <code>POST /policy</code>.</p></article></section>`;
    const diagnostics = `<section id="diagnostics" aria-labelledby="diagnostics-h">
<div><p class="eyebrow">Health and support</p><h2 id="diagnostics-h">Diagnostics</h2></div>
<article class="card"><div class="card-head"><h3>Network services</h3>${services.length > 0 ? pill('ok', `${services.length} listed`) : pill('unknown', NOT_REPORTED)}</div>
${services.length > 0 ? `<ul class="list">${services.map((s) => `<li><strong>${escapeHtml(s.name)}</strong>${s.enabled ? toned('ok', 'Enabled') : toned('unknown', 'Disabled')}</li>`).join('')}</ul>` : `<p class="empty">${isUnavailable(snapshot.networkServices) ? escapeHtml(snapshot.networkServices.replace(/^\s*unavailable:\s*/, '')) : 'No network services were listed.'}</p>`}</article>
<div class="cards">${rawDetails('Interfaces', snapshot.interfaces)}${rawDetails('Default route', snapshot.routes)}${rawDetails('DNS', snapshot.dns)}${rawDetails('VPN services', snapshot.vpnServices)}</div>
</section>`;
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light">
<title>IRP macOS Client</title><style>${LOCAL_DASHBOARD_CSS}</style></head>
<body><a class="skip" href="#overview">Skip to content</a>
<header class="top"><div class="bar"><div class="brand"><span class="mark" aria-hidden="true">IR</span><div><strong>Internet Resilience Platform</strong><small>macOS Full Client</small></div></div>
<div class="actions">${supported ? pill(route.gateway ? 'ok' : 'warn', route.gateway ? 'Default route present' : 'No default route') : pill('warn', 'Not running on macOS')}<a class="btn" href="/">Reload</a></div></div>
<nav class="tabs" aria-label="Sections"><a href="#overview">Overview</a><a href="#network">Connectivity</a><a href="#tunnel">VPN</a><a href="#security">Security</a><a href="#automation">Automation</a><a href="#diagnostics">Diagnostics</a></nav></header>
<main>${overview}${connectivity}${tunnel}${security}${automation}${diagnostics}</main>
<footer>IRP macOS Client · Local, read-only view · Data refreshes on reload</footer>
</body></html>`;
}
function label(value) {
    const words = value.replace(/[-_]+/g, ' ').toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
}
