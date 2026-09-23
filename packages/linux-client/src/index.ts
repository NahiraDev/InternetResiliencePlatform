import { execFile } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { promisify } from 'node:util';
import type { AddressInfo } from 'node:net';
import {
  ResilienceRuntime,
  type Observation,
  type ObservationProvider,
  type ObservationProviderResult,
  type RuntimeAdapterDescriptor,
  type RuntimeContext,
  type RuntimeSnapshot,
} from '@irp/resilience-runtime';

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

export type LinuxRuntimeStatus = {
  runtime: RuntimeSnapshot;
  capabilities: readonly RuntimeAdapterDescriptor[];
};

/** The Linux client entrypoint for the canonical, safe-by-default runtime. */
export class LinuxClientRuntime {
  readonly runtime: ResilienceRuntime;
  private started = false;

  constructor(system: Pick<LinuxSystemAdapter, 'snapshot'>, runtime?: ResilienceRuntime) {
    this.runtime = runtime ?? new ResilienceRuntime([new LinuxSnapshotObservationProvider(system)], {
      runtimeId: 'linux-client-runtime',
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    // Simulation observes and evaluates the complete canonical runtime path
    // without mutating host networking during client startup.
    await this.runtime.runCycle({
      correlationId: 'linux-client-startup',
      idempotencyKey: 'linux-client-startup',
      mode: 'simulation',
    });
    this.started = true;
  }

  async status(): Promise<LinuxRuntimeStatus> {
    return {
      runtime: await this.runtime.getRuntimeSnapshot(),
      capabilities: this.runtime.capabilities(),
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
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export class LinuxClientServer {
  private readonly server = createServer(
    (request, response) => void this.handle(request, response),
  );

  constructor(
    private readonly system: LinuxSystemAdapter,
    private readonly runtime = new LinuxClientRuntime(system),
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
  const server = new LinuxClientServer(new LinuxSystem());
  await server.start();
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runLinuxClient();
}
