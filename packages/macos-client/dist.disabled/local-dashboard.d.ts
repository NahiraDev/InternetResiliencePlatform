/**
 * macOS client local dashboard (presentation only).
 *
 * Rendered server-side from the snapshot the client already collects with read-only system tools
 * (`ifconfig`, `route`, `scutil`, `networksetup`). The page ships no script, holds no control token
 * and has no state-changing control: autonomous mode is changed through the authenticated
 * `POST /policy`. Navigation is plain in-page anchors.
 *
 * The parsers below read the documented output of those tools and fall back to the raw text when a
 * line does not match, so an unexpected format degrades to "show what the system said", never to a
 * guess. Visual tokens mirror docs/design/irp-design-tokens.json (enforced by
 * apps/api/src/design-tokens.test.ts).
 */
import type { MacOSClientPolicy, MacOSNetworkSnapshot } from './index.js';
export declare const LOCAL_DASHBOARD_CSS = "\n:root{color-scheme:dark light;--bg:#0A0F1C;--surface:#111827;--surface-raised:#172033;--border:#2A3A55;--text:#E8EEF9;--muted:#9AA9C0;--primary:#6AA9FF;--accent:#4FD1C5;--ok:#4ADE9A;--warn:#F5C26B;--danger:#FF7A85;font-family:-apple-system,BlinkMacSystemFont,\"SF Pro Text\",Inter,ui-sans-serif,system-ui,\"Segoe UI\",Roboto,sans-serif}\n@media (prefers-color-scheme:light){:root{--bg:#F4F7FB;--surface:#FFFFFF;--surface-raised:#EEF3F9;--border:#C9D6E6;--text:#0F1B2D;--muted:#4A5B73;--primary:#1D5FD0;--accent:#0B7A75;--ok:#0A7F4F;--warn:#8A5A00;--danger:#B42335}}\n*{box-sizing:border-box}\nbody{margin:0;background:var(--bg);color:var(--text);font-size:15px;line-height:1.5;min-width:320px}\nh1,h2,h3,p,dl,dd,ul{margin:0}\na{color:var(--primary)}\n:focus-visible{outline:3px solid var(--primary);outline-offset:2px;border-radius:6px}\n.skip{position:absolute;left:12px;top:-60px;background:var(--primary);color:var(--bg);padding:10px 14px;border-radius:10px;font-weight:600;text-decoration:none}\n.skip:focus{top:12px}\nheader.top{position:sticky;top:0;z-index:5;background:var(--surface);border-bottom:1px solid var(--border)}\n.bar{max-width:1120px;margin:0 auto;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}\n.brand{display:flex;align-items:center;gap:12px}\n.mark{width:40px;height:40px;display:grid;place-items:center;border-radius:12px;background:var(--primary);color:var(--bg);font-weight:800}\n.brand strong{display:block;font-size:14px;line-height:1.25}\n.brand small{display:block;color:var(--muted);font-size:12px}\n.actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}\n.btn{display:inline-flex;align-items:center;min-height:40px;padding:0 16px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font-weight:600;font-size:13px;text-decoration:none}\n.btn:hover{border-color:var(--primary);background:var(--surface-raised)}\nnav.tabs{max-width:1120px;margin:0 auto;padding:0 24px 8px;display:flex;gap:4px;overflow-x:auto}\nnav.tabs a{display:inline-flex;align-items:center;min-height:40px;padding:0 14px;border-radius:10px;color:var(--muted);text-decoration:none;font-weight:500;white-space:nowrap}\nnav.tabs a:hover{background:var(--surface-raised);color:var(--text)}\nmain{max-width:1120px;margin:0 auto;padding:24px;display:grid;gap:32px}\n.eyebrow{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--primary);font-weight:700;margin-bottom:4px}\nh1{font-size:28px;letter-spacing:-.02em;line-height:1.15}\nh2{font-size:20px;letter-spacing:-.01em}\nh3{font-size:16px}\n.lede{color:var(--muted);margin-top:4px}\nsection{display:grid;gap:16px;scroll-margin-top:120px}\n.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}\n.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}\n.card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px;min-width:0}\n.card.hero{background:var(--surface-raised);border-color:var(--primary)}\n.card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px}\n.k{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:600}\n.v{font-size:28px;font-weight:700;letter-spacing:-.02em;margin:8px 0 4px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}\n.v.word{font-size:22px}\n.sub{color:var(--muted);font-size:13px;overflow-wrap:anywhere}\n.pill{display:inline-flex;align-items:center;gap:6px;min-height:28px;padding:0 10px;border:1px solid var(--border);border-radius:999px;font-size:13px;font-weight:600;white-space:nowrap;background:var(--surface)}\n.pill[data-tone=\"ok\"],.t[data-tone=\"ok\"]{color:var(--ok)}\n.pill[data-tone=\"warn\"],.t[data-tone=\"warn\"]{color:var(--warn)}\n.pill[data-tone=\"danger\"],.t[data-tone=\"danger\"]{color:var(--danger)}\n.pill[data-tone=\"observing\"],.t[data-tone=\"observing\"]{color:var(--primary)}\n.pill[data-tone=\"unknown\"],.t[data-tone=\"unknown\"]{color:var(--muted)}\n.t{font-weight:600}\ndl.kv{display:grid}\ndl.kv>div{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid var(--border)}\ndl.kv>div:last-child{border-bottom:0}\ndl.kv dt{color:var(--muted);font-size:14px}\ndl.kv dd{font-weight:600;font-size:14px;text-align:right;overflow-wrap:anywhere}\nul.list{list-style:none;padding:0;display:grid;gap:8px}\nul.list li{display:flex;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface-raised);font-size:14px;overflow-wrap:anywhere}\n.chips{display:flex;flex-wrap:wrap;gap:8px}\n.chip{font-size:13px;padding:6px 10px;border-radius:8px;background:var(--surface-raised);border:1px solid var(--border);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}\n.empty{padding:16px;border:1px dashed var(--border);border-radius:10px;color:var(--muted);font-size:14px}\n.banner{padding:12px 16px;border:1px solid var(--warn);border-radius:10px;color:var(--warn);font-size:14px}\n.unavail{padding:12px 14px;border:1px solid var(--warn);border-radius:10px;color:var(--warn);font-size:14px;overflow-wrap:anywhere}\npre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto;font-size:12px;line-height:1.6;color:var(--muted);background:var(--surface-raised);border:1px solid var(--border);border-radius:10px;padding:12px}\ndetails.raw>summary{cursor:pointer;font-weight:600;min-height:28px}\ndetails.raw[open]>summary{margin-bottom:12px}\n.note{color:var(--muted);font-size:13px;border-top:1px solid var(--border);padding-top:12px;margin-top:12px}\ncode{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em;background:var(--surface-raised);padding:1px 6px;border-radius:6px}\nfooter{max-width:1120px;margin:0 auto;padding:16px 24px 32px;color:var(--muted);font-size:12px;border-top:1px solid var(--border)}\n@media (max-width:560px){.bar,main,nav.tabs,footer{padding-left:16px;padding-right:16px}h1{font-size:24px}.cards{grid-template-columns:1fr}}\n";
export type Tone = 'ok' | 'warn' | 'danger' | 'observing' | 'unknown';
export declare function escapeHtml(value: unknown): string;
export declare const isUnavailable: (text: string) => boolean;
export interface DefaultRoute {
    readonly gateway?: string;
    readonly interface?: string;
}
/** Reads `route -n get default`: lines such as `gateway: 192.0.2.1` and `interface: en0`. */
export declare function parseDefaultRoute(text: string): DefaultRoute;
export interface NetworkServiceEntry {
    readonly name: string;
    readonly enabled: boolean;
}
/** Reads `networksetup -listallnetworkservices`; a leading `*` marks a disabled service. */
export declare function parseNetworkServices(text: string): NetworkServiceEntry[];
export interface VpnServiceEntry {
    readonly name: string;
    readonly state: string;
}
/** Reads `scutil --nc list`: `* (Connected)  <uuid> VPN (<type>) "Name"  [VPN:<type>]`. */
export declare function parseVpnServices(text: string): VpnServiceEntry[];
export interface InterfaceEntry {
    readonly name: string;
    readonly up: boolean;
    readonly status?: string;
}
/** Reads `ifconfig`: a header `en0: flags=...<UP,...>` and an optional `status: active` line. */
export declare function parseInterfaces(text: string): InterfaceEntry[];
/** Unique resolver addresses from `scutil --dns` (`nameserver[0] : 1.1.1.1`), in order of appearance. */
export declare function parseDnsServers(text: string): string[];
export declare function renderMacOSDashboard(snapshot: MacOSNetworkSnapshot, policy: MacOSClientPolicy): string;
