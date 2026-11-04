import { afterEach, describe, expect, it } from 'vitest';
import { LinuxClientRuntime, LinuxClientServer, type LinuxRuntimeStatus, type LinuxSystemAdapter, type NetworkSnapshot } from './index.js';
import { formatDuration, healthTone, isUnavailable, label, renderLinuxDashboard } from './local-dashboard.js';

const snapshot: NetworkSnapshot = {
  interfaces: '1: lo: <LOOPBACK,UP>\n2: eth0: <BROADCAST,UP> inet 192.0.2.10/24',
  routes: 'default via 192.0.2.1 dev eth0',
  dns: 'Global DNS Servers: 1.1.1.1',
  capturedAt: '2026-11-03T00:00:00.000Z',
};

class FakeSystem implements LinuxSystemAdapter {
  policy = { autonomousMode: false };
  constructor(private readonly snap: NetworkSnapshot = snapshot) {}
  async snapshot() { return this.snap; }
  async setAutonomousMode(enabled: boolean) { this.policy = { autonomousMode: enabled }; }
  getPolicy() { return { ...this.policy }; }
}

const realStatus = async (): Promise<LinuxRuntimeStatus> => {
  const runtime = new LinuxClientRuntime(new FakeSystem());
  await runtime.start();
  return runtime.status();
};

describe('renderLinuxDashboard', () => {
  it('renders every section from a real runtime status, with no script and no mutating control', async () => {
    const html = renderLinuxDashboard(snapshot, { autonomousMode: false }, await realStatus());
    for (const id of ['overview', 'network', 'tunnel', 'security', 'automation', 'diagnostics']) {
      expect(html).toContain(`id="${id}"`);
      expect(html).toContain(`href="#${id}"`);
    }
    expect(html).toContain('IRP Linux Client');
    expect(html).toContain('eth0');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<form|<button|<input|onclick=/i);
    expect(html).toContain('<a class="btn" href="/">Reload</a>');
    expect(html).toContain('POST /policy');
  });

  it('states what is absent instead of inventing it', async () => {
    const html = renderLinuxDashboard(snapshot, { autonomousMode: false }, await realStatus());
    expect(html).toContain('No tunnel is configured');
    expect(html).toContain('No scheduler is attached');
    expect(html).toContain('No cycle has run');
    expect(html).toContain('did not report host authorization');
  });

  it('shows authorization evidence and every blocker when live changes are refused', async () => {
    const status: LinuxRuntimeStatus = {
      ...(await realStatus()),
      authorization: {
        requestedLive: true,
        effectiveMode: 'simulation',
        liveActive: false,
        tunnelActive: false,
        blockers: ['process lacks CAP_NET_ADMIN', 'the `ip` binary is not available'],
        evidence: { platform: 'linux', euid: 1000, capNetAdmin: false, ipBinary: false, wireGuardBinary: false, credentialsDirectory: false },
      },
    };
    const html = renderLinuxDashboard(snapshot, { autonomousMode: false }, status);
    expect(html).toContain('2 blockers');
    expect(html).toContain('process lacks CAP_NET_ADMIN');
    expect(html).toContain('the `ip` binary is not available');
    expect(html).toContain('Safe mode');
    expect(html).toContain('1000');
  });

  it('reports a command the host could not run as unavailable rather than as output', async () => {
    const html = renderLinuxDashboard(
      { ...snapshot, routes: 'unavailable: spawn ip ENOENT' },
      { autonomousMode: false },
      await realStatus(),
    );
    expect(html).toContain('Unavailable');
    expect(html).toContain('spawn ip ENOENT');
    expect(html).not.toContain('unavailable: spawn');
  });

  it('escapes every host-supplied string', async () => {
    const evil = '<img src=x onerror=alert(1)>"&\'';
    const status: LinuxRuntimeStatus = {
      ...(await realStatus()),
      activeTunnel: evil,
      tunnelActive: true,
      tunnelConfigured: true,
      authorization: {
        requestedLive: false, effectiveMode: 'simulation', liveActive: false, tunnelActive: false,
        blockers: [evil],
        evidence: { platform: evil, euid: null, capNetAdmin: null, ipBinary: true, wireGuardBinary: true, credentialsDirectory: true },
      },
    };
    const html = renderLinuxDashboard({ ...snapshot, interfaces: evil, dns: evil }, { autonomousMode: true }, status);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('never pairs a status colour without a glyph and a word', async () => {
    const html = renderLinuxDashboard(snapshot, { autonomousMode: true }, await realStatus());
    const all = html.match(/<span class="pill"/g) ?? [];
    const wellFormed =
      html.match(/<span class="pill" data-tone="\w+"><span aria-hidden="true">[●▲■◆○]<\/span>[^<\s][^<]*<\/span>/g) ?? [];
    expect(all.length).toBeGreaterThan(3);
    expect(wellFormed).toHaveLength(all.length);
  });
});

describe('formatting helpers', () => {
  it('formats durations and refuses nonsense', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(65_000)).toBe('1m 5s');
    expect(formatDuration(3_725_000)).toBe('1h 2m');
    expect(formatDuration(90_000_000)).toBe('1d 1h');
    expect(formatDuration(-1)).toBe('Not reported');
    expect(formatDuration(Number.NaN)).toBe('Not reported');
  });

  it('labels words and maps health to a tone without treating neutral as healthy', () => {
    expect(label('simulation-only')).toBe('Simulation only');
    expect(label(undefined)).toBe('Not reported');
    expect(healthTone('healthy')).toBe('ok');
    expect(healthTone('degraded')).toBe('warn');
    expect(healthTone('failed')).toBe('danger');
    expect(healthTone('unknown')).toBe('unknown');
    expect(healthTone('something-new')).toBe('unknown');
    expect(isUnavailable('  unavailable: x')).toBe(true);
    expect(isUnavailable('eth0 up')).toBe(false);
  });
});

describe('LinuxClientServer serves the redesigned page unchanged at the protocol level', () => {
  let server: LinuxClientServer | undefined;
  afterEach(async () => { await server?.stop(); server = undefined; });

  it('keeps the strict CSP, the read-only JSON health endpoint and the guarded routes', async () => {
    server = new LinuxClientServer(new FakeSystem());
    await server.start(0);
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('no address');
    const base = `http://127.0.0.1:${address.port}`;
    const page = await fetch(`${base}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(page.headers.get('content-security-policy')).toBe("default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
    const body = await page.text();
    expect(body).toContain('Linux Full Client');
    expect(body).not.toMatch(/<script/i);
    const health = await fetch(`${base}/health`);
    expect(health.headers.get('content-type')).toContain('application/json');
    expect((await fetch(`${base}/policy`, { method: 'POST', body: '{"enabled":true}' })).status).toBeGreaterThanOrEqual(400);
    expect((await fetch(`${base}/nope`)).status).toBe(404);
  });
});
