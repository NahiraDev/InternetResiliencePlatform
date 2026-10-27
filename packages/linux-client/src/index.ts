import { execFile } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { promisify } from 'node:util';
import type { AddressInfo } from 'node:net';
import {
  createCanonicalRuntime,
  type CanonicalRuntimeComposition,
  ResilienceRuntime,
  type Observation,
  type ObservationProvider,
  type ObservationProviderResult,
  type RuntimeAdapterDescriptor,
  type RuntimeContext,
  type RuntimeSnapshot,
} from '@irp/resilience-runtime';
import { createLinuxNetworkControlPlane, type LinuxNetworkControlPlane } from './linux-network-control-plane.js';

const execFileAsync = promisify(execFile);

export type NetworkSnapshot = {
  interfaces: string;
  routes: string;
  dns: string;
  capturedAt: string;
};

export type ClientPolicy = {
  autonomousMode: boolean;
  preferredInterface?: string;
};

export interface LinuxSystemAdapter {
  snapshot(): Promise<NetworkSnapshot>;
  setAutonomousMode(enabled: boolean): Promise<void>;
  getPolicy(): ClientPolicy;
}

async function command(file: string, args: string[]): Promise<string> {
  try {
    const result = await execFileAsync(file, args, { timeout: 5_000, maxBuffer: 512 * 1024 });
    return result.stdout.trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `unavailable: ${message}`;
  }
}

export class LinuxSystem implements LinuxSystemAdapter {
  private policy: ClientPolicy = { autonomousMode: false };

  async snapshot(): Promise<NetworkSnapshot> {
    const [interfaces, routes, dns] = await Promise.all([
      command('ip', ['-brief', 'address']),
      command('ip', ['-brief', 'route']),
      command('resolvectl', ['status']),
    ]);
    return { interfaces, routes, dns, capturedAt: new Date().toISOString() };
  }

  async setAutonomousMode(enabled: boolean): Promise<void> {
    this.policy = { ...this.policy, autonomousMode: enabled };
  }

  getPolicy(): ClientPolicy {
    return { ...this.policy };
  }
}

/**
 * Converts non-mutating Linux diagnostics into canonical runtime observations.
 * The provider has no execution authority; all mutations remain behind
 * ResilienceRuntime's policy, safety, transaction and verification boundaries.
 */
export class LinuxSnapshotObservationProvider implements ObservationProvider {
  readonly id = 'linux-client-diagnostics';

  constructor(private readonly system: Pick<LinuxSystemAdapter, 'snapshot'>) {}

  async collect(context: RuntimeContext): Promise<ObservationProviderResult> {
    const snapshot = await this.system.snapshot();
    const now = snapshot.capturedAt;
    const diagnosticEntries = [
      ['interfaces', snapshot.interfaces],
      ['routes', snapshot.routes],
      ['dns', snapshot.dns],
    ] as const;
    const errors = diagnosticEntries
      .filter(([, value]) => value.startsWith('unavailable:'))
      .map(([metric, value]) => `${metric}: ${value}`);
    const observations: Observation[] = diagnosticEntries.map(([metric, value]) => ({
      id: `linux-${metric}-${context.correlationId}`,
      schemaVersion: 1,
      createdAt: now,
      correlationId: context.correlationId,
      source: this.id,
      metadata: { diagnostic: metric },
      category: 'network',
      metric: `linux_${metric}_available`,
      value: value.startsWith('unavailable:') ? 0 : 1,
      timestamp: now,
      freshnessMs: 0,
      confidence: value.startsWith('unavailable:') ? 0.5 : 0.95,
      severity: value.startsWith('unavailable:') ? 'warning' : 'info',
      status: value.startsWith('unavailable:') ? 'unknown' : 'healthy',
    }));
    return { providerId: this.id, observations, collectedAt: now, errors };
  }
}

export type LinuxCapabilityStatus = {
  adapterId: string;
  subsystem: RuntimeAdapterDescriptor['subsystem'];
  status: 'registered' | 'live' | 'simulation-only';
  supportsSafe: boolean;
  supportsLive: boolean;
  verificationSupport: boolean;
  recoverySupport: boolean;
};

export type LinuxRuntimeStatus = {
  runtime: RuntimeSnapshot;
  capabilities: readonly RuntimeAdapterDescriptor[];
  capabilityStatus: readonly LinuxCapabilityStatus[];
};

/** The Linux client runtime for the canonical, safe-by-default composition. */
export class LinuxClientRuntime {
  readonly runtime: ResilienceRuntime;
  private started = false;

  private readonly composition: CanonicalRuntimeComposition;

  constructor(
    system: Pick<LinuxSystemAdapter, 'snapshot'>,
    composition?: CanonicalRuntimeComposition,
  ) {
    this.composition =
      composition ??
      createCanonicalRuntime({
        executionMode: 'simulation',
        observationProviders: [new LinuxSnapshotObservationProvider(system)],
        runtimeId: 'linux-client-runtime',
      });
    this.runtime = this.composition.runtime;
  }

  async start(): Promise<void> {
    if (this.started) return;
    // Simulation observes and evaluates the complete canonical runtime path
    // without mutating host networking during client startup.
    await this.composition.runCycle({
      correlationId: 'linux-client-startup',
      idempotencyKey: 'linux-client-startup',
    });
    this.started = true;
  }

  async status(): Promise<LinuxRuntimeStatus> {
    const capabilities = this.runtime.capabilities();
    return {
      runtime: await this.runtime.getRuntimeSnapshot(),
      capabilities,
      capabilityStatus: capabilities.map((descriptor) => ({
        adapterId: descriptor.adapterId,
        subsystem: descriptor.subsystem,
        status: descriptor.supportsLive ? 'live' : 'simulation-only',
        supportsSafe: descriptor.supportsSafe,
        supportsLive: descriptor.supportsLive,
        verificationSupport: descriptor.verificationSupport,
        recoverySupport: descriptor.recoverySupport,
      })),
    };
  }
}

/**
 * Production Linux client runtime.
 *
 * Unlike {@link LinuxClientRuntime} (which defaults to simulation), this
 * runtime wires a real {@link KernelRuntime} with the production routing
 * contract, a {@link RoutingEngine} with real Linux route discovery, and a
 * {@link ConnectivityManager} with configured providers (including
 * Starlink). It uses `executionMode: 'real'` and passes the
 * {@link CanonicalNetworkControlPlane} into {@link createCanonicalRuntime}
 * so the {@link CanonicalNetworkRuntimeAdapter} is registered with
 * `supportsLive: true`.
 *
 * The production runtime does NOT bypass the canonical mutation boundary.
 * All mutations still flow through the canonical runtime and its privileged
 * mutation boundary before reaching the kernel routing contract and the
 * Linux route executor.
 */
export class LinuxProductionRuntime {
  readonly runtime: ResilienceRuntime;
  private started = false;

  readonly composition: CanonicalRuntimeComposition;
  readonly controlPlane: LinuxNetworkControlPlane;

  constructor(
    system: Pick<LinuxSystemAdapter, 'snapshot'>,
    options: {
      readonly enableLiveRouteMutation?: boolean;
      readonly executionMode?: import('@irp/resilience-runtime').CanonicalExecutionMode;
      readonly netns?: string;
      readonly connectivityProviders?: readonly import('@irp/connectivity').ConnectivityProvider[];
      readonly registerStarlink?: boolean;
      readonly starlinkOptions?: { readonly target?: string; readonly grpcurlCommand?: string };
      readonly composition?: CanonicalRuntimeComposition;
    } = {},
  ) {
    this.controlPlane = createLinuxNetworkControlPlane({
      ...(options.enableLiveRouteMutation !== undefined ? { enableLiveRouteMutation: options.enableLiveRouteMutation } : {}),
      ...(options.netns ? { netns: options.netns } : {}),
      ...(options.connectivityProviders ? { connectivityProviders: options.connectivityProviders } : {}),
      ...(options.registerStarlink !== undefined ? { registerStarlink: options.registerStarlink } : {}),
      ...(options.starlinkOptions ? { starlinkOptions: options.starlinkOptions } : {}),
    });
    this.composition =
      options.composition ??
      createCanonicalRuntime({
        executionMode: options.executionMode ?? 'real',
        observationProviders: [new LinuxSnapshotObservationProvider(system)],
        runtimeId: 'linux-production-runtime',
        networkControlPlane: this.controlPlane.controlPlane,
      });
    this.runtime = this.composition.runtime;
  }

  async start(): Promise<void> {
    if (this.started) return;
    await this.composition.runCycle({
      correlationId: 'linux-production-startup',
      idempotencyKey: 'linux-production-startup',
    });
    this.started = true;
  }

  async status(): Promise<LinuxRuntimeStatus> {
    const capabilities = this.runtime.capabilities();
    return {
      runtime: await this.runtime.getRuntimeSnapshot(),
      capabilities,
      capabilityStatus: capabilities.map((descriptor) => ({
        adapterId: descriptor.adapterId,
        subsystem: descriptor.subsystem,
        status: descriptor.supportsLive ? 'live' : 'simulation-only',
        supportsSafe: descriptor.supportsSafe,
        supportsLive: descriptor.supportsLive,
        verificationSupport: descriptor.verificationSupport,
        recoverySupport: descriptor.recoverySupport,
      })),
    };
  }

  /**
   * Exposes whether the production routing contract is registered and the
   * canonical network adapter supports live execution.
   */
  getRouteMutationCapability(): {
    readonly kernelId: string;
    readonly routingContractRegistered: boolean;
    readonly liveRouteMutationEnabled: boolean;
    readonly capabilityStatus: readonly LinuxCapabilityStatus[];
  } {
    const capabilities = this.runtime.capabilities();
    const routingAdapter = capabilities.find((c) => c.subsystem === 'routing' && c.supportsLive);
    const connectivityAdapter = capabilities.find((c) => c.subsystem === 'connectivity' && c.supportsLive);
    return {
      kernelId: this.controlPlane.kernel.id,
      routingContractRegistered: true,
      liveRouteMutationEnabled: Boolean(routingAdapter?.supportsLive || connectivityAdapter?.supportsLive),
      capabilityStatus: capabilities.map((descriptor) => ({
        adapterId: descriptor.adapterId,
        subsystem: descriptor.subsystem,
        status: descriptor.supportsLive ? 'live' : 'simulation-only',
        supportsSafe: descriptor.supportsSafe,
        supportsLive: descriptor.supportsLive,
        verificationSupport: descriptor.verificationSupport,
        recoverySupport: descriptor.recoverySupport,
      })),
    };
  }
}

const html = (
  snapshot: NetworkSnapshot,
  policy: ClientPolicy,
  runtimeStatus: LinuxRuntimeStatus,
): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>IRP Linux Client</title><style>body{font:15px system-ui,sans-serif;max-width:1000px;margin:32px auto;padding:0 16px}pre{white-space:pre-wrap;background:#f4f4f4;padding:16px;border-radius:8px}button{padding:8px 12px}</style></head>
<body><h1>Internet Resilience Platform</h1><p>Linux Full Client</p><p>Autonomous mode: <strong>${policy.autonomousMode ? 'enabled' : 'disabled'}</strong></p>
<form method="post" action="/policy"><button name="autonomousMode" value="${policy.autonomousMode ? 'false' : 'true'}">${policy.autonomousMode ? 'Disable' : 'Enable'} autonomous mode</button></form>
<h2>Canonical runtime status</h2><pre>${escapeHtml(JSON.stringify(runtimeStatus, null, 2))}</pre>
<h2>Network diagnostics</h2><pre>${escapeHtml(JSON.stringify(snapshot, null, 2))}</pre></body></html>`;

function escapeHtml(value: string): string {
  return value
    .replaceAll(String.fromCharCode(38), String.fromCharCode(38) + 'amp;')
    .replaceAll(String.fromCharCode(60), String.fromCharCode(38) + 'lt;')
    .replaceAll(String.fromCharCode(62), String.fromCharCode(38) + 'gt;')
    .replaceAll(String.fromCharCode(34), String.fromCharCode(38) + 'quot;');
}

/** Shared interface for runtime implementations usable by the server. */
export interface LinuxRuntime {
  start(): Promise<void>;
  status(): Promise<LinuxRuntimeStatus>;
}

export class LinuxClientServer {
  private readonly server = createServer(
    (request, response) => void this.handle(request, response),
  );

  constructor(
    private readonly system: LinuxSystemAdapter,
    private readonly runtime: LinuxRuntime = new LinuxClientRuntime(system),
  ) {}

  async start(port = 17861, host = '127.0.0.1'): Promise<void> {
    await this.runtime.start();
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, host, () => resolve());
    });
  }

  address(): string | AddressInfo | null {
    return this.server.address();
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      this.server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method === 'GET' && request.url === '/') {
      response.end(
        html(await this.system.snapshot(), this.system.getPolicy(), await this.runtime.status()),
      );
      return;
    }
    if (request.method === 'GET' && request.url === '/health') {
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify(await this.runtime.status()));
      return;
    }
    if (request.method === 'POST' && request.url === '/policy') {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks).toString('utf8');
      const enabled = /autonomousMode=true(?:&|$)/.test(body);
      await this.system.setAutonomousMode(enabled);
      response.statusCode = 303;
      response.setHeader('Location', '/');
      response.end();
      return;
    }
    response.statusCode = 404;
    response.end('Not Found');
  }
}

export async function runLinuxClient(): Promise<LinuxClientServer> {
  // Explicit mode config: simulation is the default; real mode is an opt-in
  // via IRP_EXECUTION_MODE=real. Live route mutation additionally requires
  // CAP_NET_ADMIN; when not available, the runtime still observes real network
  // state and registers providers, but route apply fails closed at the kernel
  // executor boundary.
  const executionMode =
    process.env.IRP_EXECUTION_MODE === 'real'
      ? ('real' as const)
      : ('simulation' as const);
  const system = new LinuxSystem();
  const runtime = new LinuxProductionRuntime(system, {
    enableLiveRouteMutation: executionMode === 'real',
    executionMode,
  });
  const server = new LinuxClientServer(system, runtime);
  await server.start();
  return server;
}
