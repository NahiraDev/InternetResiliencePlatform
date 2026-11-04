import { afterEach, describe, expect, it } from 'vitest';
import { MacOSClientServer, MacOSSystem, type MacOSNetworkSnapshot } from '../src/index.js';
import {
  parseDefaultRoute,
  parseDnsServers,
  parseInterfaces,
  parseNetworkServices,
  parseVpnServices,
  renderMacOSDashboard,
} from '../src/local-dashboard.js';

// Output formats documented for route(8), networksetup(8), scutil(8) and ifconfig(8).
const ROUTE = `   route to: default
destination: default
       mask: default
    gateway: 192.0.2.1
  interface: en0
      flags: <UP,GATEWAY,DONE,STATIC,PRCLONING,GLOBAL>`;
const SERVICES = `An asterisk (*) denotes that a network service is disabled.
Wi-Fi
Thunderbolt Bridge
*USB 10/100/1000 LAN`;
const VPNS = `Available network connection services in the current set (*=enabled):
* (Connected)      11111111-2222-3333-4444-555555555555 VPN (com.wireguard.macos) "Work WireGuard"            [VPN:com.wireguard.macos]
* (Disconnected)   66666666-7777-8888-9999-000000000000 VPN (com.example.vpn) "Backup <b>VPN</b>"            [VPN:com.example.vpn]`;
const IFCONFIG = `lo0: flags=8049<UP,LOOPBACK,RUNNING,MULTICAST> mtu 16384
	inet 127.0.0.1 netmask 0xff000000
en0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500
	inet 192.0.2.20 netmask 0xffffff00 broadcast 192.0.2.255
	status: active
en1: flags=8822<BROADCAST,SMART,SIMPLEX,MULTICAST> mtu 1500
	status: inactive
awdl0: flags=8943<UP,BROADCAST,RUNNING,PROMISC,SIMPLEX,MULTICAST> mtu 1500
	status: inactive`;
const DNS = `DNS configuration
resolver #1
  nameserver[0] : 1.1.1.1
  nameserver[1] : 9.9.9.9
resolver #2
  nameserver[0] : 1.1.1.1`;

const supportedSnapshot = (overrides: Partial<MacOSNetworkSnapshot> = {}): MacOSNetworkSnapshot => ({
  interfaces: IFCONFIG,
  routes: ROUTE,
  dns: DNS,
  networkServices: SERVICES,
  vpnServices: VPNS,
  capturedAt: '2026-11-03T00:00:00.000Z',
  platform: 'darwin',
  ...overrides,
});

describe('macOS output parsers', () => {
  it('reads the default route', () => {
    expect(parseDefaultRoute(ROUTE)).toEqual({ gateway: '192.0.2.1', interface: 'en0' });
    expect(parseDefaultRoute('route: writing to routing socket: not in table')).toEqual({});
    expect(parseDefaultRoute('unavailable: spawn route ENOENT')).toEqual({});
  });

  it('reads network services and marks disabled ones', () => {
    expect(parseNetworkServices(SERVICES)).toEqual([
      { name: 'Wi-Fi', enabled: true },
      { name: 'Thunderbolt Bridge', enabled: true },
      { name: 'USB 10/100/1000 LAN', enabled: false },
    ]);
    expect(parseNetworkServices('unavailable: x')).toEqual([]);
  });

  it('reads VPN services with their state and quoted name', () => {
    expect(parseVpnServices(VPNS)).toEqual([
      { name: 'Work WireGuard', state: 'Connected' },
      { name: 'Backup <b>VPN</b>', state: 'Disconnected' },
    ]);
    expect(parseVpnServices('No network connection services found.')).toEqual([]);
  });

  it('reads interfaces, their up flag and status', () => {
    expect(parseInterfaces(IFCONFIG)).toEqual([
      { name: 'lo0', up: true },
      { name: 'en0', up: true, status: 'active' },
      { name: 'en1', up: false, status: 'inactive' },
      { name: 'awdl0', up: true, status: 'inactive' },
    ]);
  });

  it('lists each resolver address once, in order', () => {
    expect(parseDnsServers(DNS)).toEqual(['1.1.1.1', '9.9.9.9']);
    expect(parseDnsServers('')).toEqual([]);
  });
});

describe('renderMacOSDashboard', () => {
  it('renders parsed cards for a supported host, with no script or mutating control', () => {
    const html = renderMacOSDashboard(supportedSnapshot(), { autonomousMode: true, preferredInterface: 'en0' });
    for (const id of ['overview', 'network', 'tunnel', 'security', 'automation', 'diagnostics']) {
      expect(html).toContain(`id="${id}"`);
      expect(html).toContain(`href="#${id}"`);
    }
    expect(html).toContain('via 192.0.2.1');
    expect(html).toContain('Interface en0');
    expect(html).toContain('1 connected');
    expect(html).toContain('Work WireGuard');
    expect(html).toContain('2 found');
    expect(html).toContain('USB 10/100/1000 LAN');
    expect(html).toContain('Enabled');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<form|<button|<input|onclick=/i);
    expect(html).toContain('<a class="btn" href="/">Reload</a>');
  });

  it('says plainly that the host is not macOS instead of showing empty-looking data', async () => {
    if (process.platform === 'darwin') return;
    const snapshot = await new MacOSSystem().snapshot();
    const html = renderMacOSDashboard(snapshot, { autonomousMode: false });
    expect(html).toContain('Not running on macOS');
    expect(html).toContain('Unsupported');
    expect(html).toContain('macOS platform required');
    expect(html).not.toContain('No default route');
    expect(html).not.toContain('No VPN services are configured');
  });

  it('shows empty states for a supported host with nothing configured', () => {
    const html = renderMacOSDashboard(
      supportedSnapshot({ routes: 'route: not in table', vpnServices: '', networkServices: '', dns: '', interfaces: '' }),
      { autonomousMode: false },
    );
    expect(html).toContain('No default route');
    expect(html).toContain('No VPN services are configured on this Mac.');
    expect(html).toContain('No network services were listed.');
    expect(html).toContain('No resolver addresses were found');
    expect(html).toContain('No interfaces were parsed');
  });

  it('reports a failing system tool as unavailable with its reason', () => {
    const html = renderMacOSDashboard(supportedSnapshot({ dns: 'unavailable: scutil timed out' }), { autonomousMode: false });
    expect(html).toContain('Unavailable');
    expect(html).toContain('scutil timed out');
    expect(html).not.toContain('unavailable: scutil');
  });

  it('escapes every system-supplied string, including VPN names', () => {
    const html = renderMacOSDashboard(supportedSnapshot(), { autonomousMode: false });
    expect(html).not.toContain('<b>VPN</b>');
    expect(html).toContain('Backup &lt;b&gt;VPN&lt;/b&gt;');
  });

  it('pairs every pill with a glyph and a word', () => {
    const html = renderMacOSDashboard(supportedSnapshot(), { autonomousMode: false });
    const all = html.match(/<span class="pill"/g) ?? [];
    const good = html.match(/<span class="pill" data-tone="\w+"><span aria-hidden="true">[●▲■◆○]<\/span>[^<\s][^<]*<\/span>/g) ?? [];
    expect(all.length).toBeGreaterThan(3);
    expect(good).toHaveLength(all.length);
  });
});

describe('MacOSClientServer with the redesigned page', () => {
  let server: MacOSClientServer | undefined;
  afterEach(async () => { await server?.stop(); server = undefined; });

  it('serves the page with a script-free CSP and keeps the JSON and guarded routes', async () => {
    server = new MacOSClientServer(new MacOSSystem());
    await server.start(0);
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('no address');
    const base = `http://127.0.0.1:${address.port}`;
    const page = await fetch(`${base}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(page.headers.get('content-security-policy')).toBe("default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
    expect(await page.text()).toContain('macOS Full Client');
    expect(((await (await fetch(`${base}/policy`)).json()) as { autonomousMode: boolean }).autonomousMode).toBe(false);
    expect((await fetch(`${base}/policy`, { method: 'POST', body: '{"enabled":true}' })).status).toBeGreaterThanOrEqual(400);
    expect((await fetch(`${base}/nope`)).status).toBe(404);
  });
});
