import { execFile } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { promisify } from 'node:util';
import {
  discoverInterfaces,
  discoverRoutes,
  discoverGateway,
  addRoute,
  deleteRoute,
  mutateRouteTransactional,
  type RouteMutationRequest,
  ipHelperAvailable,
  ipHelperError,
} from './native/ip-helper.js';
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

const execFileAsync = promisify(execFile);

export type CapabilityStatus = 'available' | 'unsupported' | 'permission-required';

export type WindowsCapabilityReport = {
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

export type WindowsNetworkSnapshot = {
  interfaces: string;
  routes: string;
  dns: string;
  gateway: string | null;
  capturedAt: string;
  platform: 'win32' | 'unsupported';
  capabilities: WindowsCapabilityReport;
};

export type WindowsClientPolicy = {
  autonomousMode: boolean;
};

export interface WindowsSystemAdapter {
  snapshot(): Promise<WindowsNetworkSnapshot>;
  setAutonomousMode(enabled: boolean): Promise<void>;
  getPolicy(): WindowsClientPolicy;
  getCapabilities(): Promise<WindowsCapabilityReport>;
  addRoute(request: RouteMutationRequest): Promise<{ ok: boolean; error?: string }>;
  deleteRoute(request: RouteMutationRequest): Promise<{ ok: boolean; error?: string }>;
  mutateRouteTransactional(
    request: RouteMutationRequest,
    verify: () => Promise<boolean>,
  ): Promise<{ readonly outcome: 'committed' | 'rolled-back' | 'failed'; readonly error?: string | undefined }>;
  readRefreshToken(): Promise<{ token: string | null; available: boolean; error?: string }>;
  writeRefreshToken(token: string): Promise<{ ok: boolean; available: boolean; error?: string }>;
  removeRefreshToken(): Promise<{ ok: boolean; available: boolean; error?: string }>;
}

async function command(file: string, args: string[], timeout = 5_000): Promise<string> {
  try {
    const result = await execFileAsync(file, args, {
      timeout,
      maxBuffer: 512 * 1024,
      windowsHide: true,
    });
    return result.stdout.trim();
  } catch (error) {
    return `unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export class WindowsSystem implements WindowsSystemAdapter {
  private policy: WindowsClientPolicy = { autonomousMode: false };
  private privileged: PrivilegeLevel = 'unknown';
  private privilegesChecked = false;

  async snapshot(): Promise<WindowsNetworkSnapshot> {
    if (process.platform !== 'win32') {
      return {
        interfaces: 'unavailable: Windows platform required',
        routes: 'unavailable: Windows platform required',
        dns: 'unavailable: Windows platform required',
        gateway: null,
        capturedAt: new Date().toISOString(),
        platform: 'unsupported',
        capabilities: unavailCapabilities(),
      };
    }

    await this.ensurePrivilege();
    const [interfacesResult, routesResult, gatewayResult] = await Promise.all([
      discoverInterfaces(),
      discoverRoutes(),
      discoverGateway(),
    ]);

    const dns = ipHelperAvailable()
      ? 'native IP Helper API'
      : 'unavailable: native bindings not installed';

    return {
      interfaces: interfacesResult.available
        ? `discovered ${interfacesResult.interfaces.length} interface(s) via IP Helper API`
        : `unavailable: ${interfacesResult.error ?? 'unknown error'}`,
      routes: routesResult.available
        ? `route table readable (${routesResult.routes.length} route(s))`
        : `unavailable: ${routesResult.error ?? 'unknown error'}`,
      dns,
      gateway: gatewayResult.available ? gatewayResult.gateway : null,
      capturedAt: new Date().toISOString(),
      platform: 'win32',
      capabilities: await this.getCapabilities(),
    };
  }

  async getCapabilities(): Promise<WindowsCapabilityReport> {
    await this.ensurePrivilege();
    const native = ipHelperAvailable();
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

  getPolicy(): WindowsClientPolicy {
    return { ...this.policy };
  }

  async addRoute(request: RouteMutationRequest): Promise<{ ok: boolean; error?: string }> {
    await this.ensurePrivilege();
    if (!ipHelperAvailable()) {
      return { ok: false, error: 'IP Helper API native bindings not installed' };
    }
    if (this.privileged !== 'administrator') {
      return { ok: false, error: 'administrator privilege required for route mutation' };
    }
    return addRoute(request);
  }

  async deleteRoute(request: RouteMutationRequest): Promise<{ ok: boolean; error?: string }> {
    await this.ensurePrivilege();
    if (!ipHelperAvailable()) {
      return { ok: false, error: 'IP Helper API native bindings not installed' };
    }
    if (this.privileged !== 'administrator') {
      return { ok: false, error: 'administrator privilege required for route mutation' };
    }
    return deleteRoute(request);
  }

  async mutateRouteTransactional(
    request: RouteMutationRequest,
    verify: () => Promise<boolean>,
  ): Promise<{ readonly outcome: 'committed' | 'rolled-back' | 'failed'; readonly error?: string | undefined }> {
    await this.ensurePrivilege();
    if (!ipHelperAvailable()) {
      return { outcome: 'failed', error: 'IP Helper API native bindings not installed' };
    }
    if (this.privileged !== 'administrator') {
      return { outcome: 'failed', error: 'administrator privilege required for route mutation' };
    }
    return mutateRouteTransactional(request, verify);
  }

  // ── Secure credential storage (Windows Credential Manager) ──────────────

  async readRefreshToken(): Promise<{ token: string | null; available: boolean; error?: string }> {
    return readCredential();
  }

  async writeRefreshToken(token: string): Promise<{ ok: boolean; available: boolean; error?: string }> {
    return writeCredential(token);
  }

  async removeRefreshToken(): Promise<{ ok: boolean; available: boolean; error?: string }> {
    return removeCredential();
  }

  private async ensurePrivilege(): Promise<void> {
    if (this.privilegesChecked) return;
    const report = await detectPrivilege();
    this.privileged = report.level;
    this.privilegesChecked = true;
    if (report.error) {
      // Degrade but keep observe-only capability visible.
      this.privileged = 'unknown';
    }
  }
}

function unavailCapabilities(): WindowsCapabilityReport {
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

export type WindowsClientServerOptions = {
  readonly system: WindowsSystemAdapter;
  readonly controlToken?: string;
}

export class WindowsClientServer {
  private readonly server = createServer(
    (request: IncomingMessage, response: ServerResponse) => void this.handle(request, response),
  );
  private port = 0;

  constructor(
    private readonly system: WindowsSystemAdapter,
    private readonly controlToken?: string,
  ) {}

  async start(port = 17863, host = '127.0.0.1'): Promise<void> {
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

  private refuse(response: ServerResponse, status: number, reason: string): void {
    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ error: reason }));
  }

  private async handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
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
    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not found' }));
  }
}

export async function runWindowsClient(
  options: WindowsClientServerOptions = { system: new WindowsSystem() },
): Promise<WindowsClientServer> {
  const server = new WindowsClientServer(options.system, options.controlToken);
  await server.start();
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void runWindowsClient();
}
