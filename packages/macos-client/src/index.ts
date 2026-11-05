import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  discoverInterfaces,
  discoverRoutes,
  discoverGateway,
  discoverDNS,
  checkReachability,
  scAvailable,
  scLoadError,
} from './native/system-configuration.js';
import {
  detectPrivilege,
  readTokenElevation,
  type PrivilegeLevel,
} from './native/privilege.js';
import {
  readCredential,
  writeCredential,
  removeCredential,
} from './native/credentials.js';
import {
  guardRequest,
  guardStateChange,
  issueControlToken,
  parseAutonomyRequest,
  readBoundedBody,
  type GuardVerdict,
} from './http-guard.js';
import { renderMacOSDashboard } from './local-dashboard.js';

export type CapabilityStatus = 'available' | 'unsupported' | 'permission-required';

export type MacOSCapabilityReport = {
  readonly interfaceDiscovery: CapabilityStatus;
  readonly routeDiscovery: CapabilityStatus;
  readonly routeMutation: CapabilityStatus;
  readonly dnsInspection: CapabilityStatus;
  readonly dnsConfiguration: CapabilityStatus;
  readonly gatewayDiscovery: CapabilityStatus;
  readonly connectivityMonitoring: CapabilityStatus;
  readonly privilege: PrivilegeLevel;
  readonly nativeBindings: boolean;
};

export type MacOSNetworkSnapshot = {
  interfaces: string;
  routes: string;
  dns: string;
  networkServices: string;
  vpnServices: string;
  gateway: string | null;
  capturedAt: string;
  platform: 'darwin' | 'unsupported';
  capabilities: MacOSCapabilityReport;
};

export type MacOSClientPolicy = {
  autonomousMode: boolean;
  preferredInterface?: string;
};

export interface MacOSSystemAdapter {
  snapshot(): Promise<MacOSNetworkSnapshot>;
  setAutonomousMode(enabled: boolean): Promise<void>;
  getPolicy(): MacOSClientPolicy;
  getCapabilities(): Promise<MacOSCapabilityReport>;
  readRefreshToken(): Promise<{ token: string | null; available: boolean; error?: string }>;
  writeRefreshToken(token: string): Promise<{ ok: boolean; available: boolean; error?: string }>;
  removeRefreshToken(): Promise<{ ok: boolean; available: boolean; error?: string }>;
}

export class MacOSSystem implements MacOSSystemAdapter {
  private policy: MacOSClientPolicy = { autonomousMode: false };
  private privileged: PrivilegeLevel = 'unknown';
  private privilegesChecked = false;

  async snapshot(): Promise<MacOSNetworkSnapshot> {
    if (process.platform !== 'darwin') {
      return {
        interfaces: 'unavailable: macOS platform required',
        routes: 'unavailable: macOS platform required',
        dns: 'unavailable: macOS platform required',
        networkServices: 'unavailable: macOS platform required',
        vpnServices: 'unavailable: macOS platform required',
        gateway: null,
        capturedAt: new Date().toISOString(),
        platform: 'unsupported',
        capabilities: unavailCapabilities(),
      };
    }

    await this.ensurePrivilege();
    const [interfacesResult, routesResult, gatewayResult, dnsResult] = await Promise.all([
      discoverInterfaces(),
      discoverRoutes(),
      discoverGateway(),
      discoverDNS(),
    ]);

    const dns = dnsResult.available
      ? `SystemConfiguration DNS (${dnsResult.servers.length} server(s))`
      : `unavailable: ${dnsResult.error ?? 'native bindings not installed'}`;

    return {
      interfaces: interfacesResult.available
        ? `discovered ${interfacesResult.interfaces.length} interface(s) via SystemConfiguration`
        : `unavailable: ${interfacesResult.error ?? 'unknown error'}`,
      routes: routesResult.available
        ? `route table readable (${routesResult.routes.length} route(s))`
        : `unavailable: ${routesResult.error ?? 'unknown error'}`,
      dns,
      networkServices: interfacesResult.available ? 'SystemConfiguration' : '',
      vpnServices: '',
      gateway: gatewayResult.available ? gatewayResult.gateway : null,
      capturedAt: new Date().toISOString(),
      platform: 'darwin',
      capabilities: await this.getCapabilities(),
    };
  }

  async getCapabilities(): Promise<MacOSCapabilityReport> {
    await this.ensurePrivilege();
    const native = scAvailable();
    return {
      interfaceDiscovery: native ? 'available' : 'unsupported',
      routeDiscovery: native ? 'available' : 'unsupported',
      routeMutation: native && this.privileged === 'administrator' ? 'available' : 'permission-required',
      dnsInspection: native ? 'available' : 'unsupported',
      dnsConfiguration: native && this.privileged === 'administrator' ? 'available' : 'permission-required',
      gatewayDiscovery: native ? 'available' : 'unsupported',
      connectivityMonitoring: 'available',
      privilege: this.privileged,
      nativeBindings: native,
    };
  }

  async setAutonomousMode(enabled: boolean): Promise<void> {
    this.policy = { autonomousMode: enabled };
  }

  getPolicy(): MacOSClientPolicy {
    return { ...this.policy };
  }

  // ── Secure credential storage (Keychain) ────────────────────────────────

  async readRefreshToken(): Promise<{ token: string | null; available: boolean; error?: string }> {
    return readCredential();
  }

  async writeRefreshToken(token: string): Promise<{ ok: boolean; available: boolean; error?: string }> {
    return writeCredential(token);
  }

  async removeRefreshToken(): Promise<{ ok: boolean; available: boolean; error?: string }> {
    return removeCredential();
  }

  // ── Connectivity monitoring (SystemConfiguration reachability) ──────────

  async checkReachability(host: string): Promise<{
    readonly reachable: boolean;
    readonly available: boolean;
    readonly error?: string;
  }> {
    return checkReachability(host);
  }

  private async ensurePrivilege(): Promise<void> {
    if (this.privilegesChecked) return;
    const report = await detectPrivilege();
    this.privileged = report.level;
    this.privilegesChecked = true;
    if (report.error) {
      this.privileged = 'unknown';
    }
  }
}

function unavailCapabilities(): MacOSCapabilityReport {
  return {
    interfaceDiscovery: 'unsupported',
    routeDiscovery: 'unsupported',
    routeMutation: 'unsupported',
    dnsInspection: 'unsupported',
    dnsConfiguration: 'unsupported',
    gatewayDiscovery: 'unsupported',
    connectivityMonitoring: 'unsupported',
    privilege: 'unknown',
    nativeBindings: false,
  };
}

export type MacOSClientServerOptions = {
  readonly system: MacOSSystemAdapter;
  readonly controlToken?: string;
};

export class MacOSClientServer {
  private readonly server = createServer(
    (request: IncomingMessage, response: ServerResponse) => void this.handle(request, response),
  );
  private port = 0;

  constructor(
    private readonly system: MacOSSystemAdapter,
    private readonly controlToken?: string,
  ) {}

  async start(port = 17864, host = '127.0.0.1'): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        this.server.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        this.server.off('error', onError);
        resolve();
      };
      this.server.once('error', onError);
      this.server.once('listening', onListening);
      this.server.listen(port, host);
    });
    const addr = this.server.address();
    this.port = typeof addr === 'object' && addr !== null ? (addr as AddressInfo).port : port;
  }

  address(): { port: number } | null {
    const addr = this.server.address();
    if (addr === null || typeof addr === 'string') return null;
    return { port: (addr as AddressInfo).port };
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      this.server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  private refuse(response: ServerResponse, verdict: GuardVerdict): void {
    response.statusCode = verdict.status;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ error: verdict.reason }));
  }

  private async handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');

    // Serve the HTML dashboard at root with CSP.
    if (request.method === 'GET' && request.url === '/') {
      const port = this.address()?.port ?? 0;
      const verdict = guardRequest(request, port);
      if (!verdict.ok) {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.statusCode = verdict.status;
        response.end(JSON.stringify({ error: verdict.reason }));
        return;
      }
      const snapshot = await this.system.snapshot();
      const policy = this.system.getPolicy();
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
      );
      response.end(renderMacOSDashboard(snapshot, policy));
      return;
    }

    if (request.method === 'GET' && request.url === '/health') {
      response.end(JSON.stringify({ status: 'ok', platform: process.platform }));
      return;
    }
    if (request.method === 'GET' && request.url === '/capabilities') {
      const caps = await this.system.getCapabilities();
      response.end(JSON.stringify(caps));
      return;
    }
    if (request.method === 'GET' && request.url === '/snapshot') {
      const snap = await this.system.snapshot();
      response.end(JSON.stringify(snap));
      return;
    }
    if (request.method === 'GET' && request.url === '/policy') {
      response.end(JSON.stringify(this.system.getPolicy()));
      return;
    }
    if (request.method === 'POST' && request.url === '/policy') {
      const port = this.address()?.port ?? 0;
      const pre = guardRequest(request, port);
      if (!pre.ok) return this.refuse(response, pre);
      const gate = guardStateChange(request, this.controlToken);
      if (!gate.ok) return this.refuse(response, gate);
      const body = await readBoundedBody(request);
      if (typeof body !== 'string') return this.refuse(response, body);
      const parsed = parseAutonomyRequest(body);
      if ('ok' in parsed) return this.refuse(response, parsed);
      await this.system.setAutonomousMode(parsed.enabled);
      response.statusCode = 200;
      response.end(JSON.stringify({ autonomousMode: parsed.enabled }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not found' }));
  }
}

export async function runMacOSClient(
  options: MacOSClientServerOptions = { system: new MacOSSystem() },
): Promise<MacOSClientServer> {
  const server = new MacOSClientServer(options.system, options.controlToken);
  await server.start();
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void runMacOSClient();
}
