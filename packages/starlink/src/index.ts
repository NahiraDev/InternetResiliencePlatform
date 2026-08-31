import { createConnection } from 'node:net';
import type {
  ConnectivityCapability,
  ConnectivityHealth,
  ConnectivityOperationResult,
  ConnectivityProvider,
  ConnectivityResource,
  ConnectivityState,
} from '@irp/connectivity';

export interface StarlinkCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface StarlinkCommandRunner {
  run(command: string, args: string[], options?: { timeoutMs?: number }): Promise<StarlinkCommandResult>;
}

export interface StarlinkProviderOptions {
  commandRunner: StarlinkCommandRunner;
  target?: string;
  grpcurlCommand?: string;
  resourceId?: string;
  timeoutMs?: number;
  minimumHealthyScore?: number;
}

export interface StarlinkStatusSnapshot {
  state?: string;
  latencyMs?: number;
  packetLoss?: number;
  downloadMbps?: number;
  uploadMbps?: number;
  obstructionPercent?: number;
  uptimeSeconds?: number;
  raw: Record<string, unknown>;
}

const DEFAULT_TARGET = '192.168.100.1:9200';
const DEFAULT_GRPCURL = 'grpcurl';
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_RESOURCE_ID = 'starlink-dish';
const DEFAULT_HEALTHY_SCORE = 60;
const GRPC_METHOD = 'SpaceX.API.Device.Device/Handle';
const capabilities: ConnectivityCapability[] = [
  'monitor',
  'health-check',
  'supports-ipv4',
  'supports-ipv6',
  'supports-default-route',
  'supports-dns',
  'supports-tunneling',
];

export class NodeStarlinkCommandRunner implements StarlinkCommandRunner {
  async run(command: string, args: string[], options: { timeoutMs?: number } = {}): Promise<StarlinkCommandResult> {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    try {
      const result = await execFileAsync(command, args, {
        timeout: options.timeoutMs,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
      });
      return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
    } catch (error) {
      const failure = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number | string };
      return {
        stdout: failure.stdout ?? '',
        stderr: failure.stderr ?? failure.message ?? 'command failed',
        exitCode: typeof failure.code === 'number' ? failure.code : 1,
      };
    }
  }
}

export class StarlinkDishClient {
  private readonly target: string;
  private readonly grpcurlCommand: string;
  private readonly timeoutMs: number;

  constructor(private readonly options: StarlinkProviderOptions) {
    this.target = options.target ?? DEFAULT_TARGET;
    this.grpcurlCommand = options.grpcurlCommand ?? DEFAULT_GRPCURL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!/^\[[0-9a-fA-F:]+\]|[^:]+:\d+$/.test(this.target)) throw new Error('Invalid Starlink gRPC target');
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs <= 0) throw new Error('Starlink timeoutMs must be positive');
  }

  async probe(): Promise<boolean> {
    return new Promise((resolve) => {
      const separator = this.target.lastIndexOf(':');
      const host = this.target.startsWith('[') ? this.target.slice(1, this.target.indexOf(']')) : this.target.slice(0, separator);
      const port = Number(this.target.slice(separator + 1));
      const socket = createConnection({ host, port });
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, this.timeoutMs);
      socket.once('connect', () => {
        clearTimeout(timer);
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => {
        clearTimeout(timer);
        socket.destroy();
        resolve(false);
      });
    });
  }

  async getStatus(): Promise<StarlinkStatusSnapshot | undefined> {
    const result = await this.options.commandRunner.run(
      this.grpcurlCommand,
      ['-plaintext', '-format', 'json', '-d', '{"get_status":{}}', this.target, GRPC_METHOD],
      { timeoutMs: this.timeoutMs },
    );
    if (result.exitCode !== 0 || !result.stdout.trim()) return undefined;
    try {
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      return parseStatus(parsed);
    } catch {
      return undefined;
    }
  }
}

export class StarlinkProvider implements ConnectivityProvider {
  readonly id = 'starlink';
  readonly type = 'custom' as const;
  private readonly client: StarlinkDishClient;
  private readonly resourceId: string;
  private readonly minimumHealthyScore: number;
  private lastStatus: StarlinkStatusSnapshot | undefined;

  constructor(options: StarlinkProviderOptions) {
    this.client = new StarlinkDishClient(options);
    this.resourceId = options.resourceId ?? DEFAULT_RESOURCE_ID;
    this.minimumHealthyScore = options.minimumHealthyScore ?? DEFAULT_HEALTHY_SCORE;
  }

  capabilities(): ConnectivityCapability[] {
    return [...capabilities];
  }

  async discover(): Promise<ConnectivityResource[]> {
    const reachable = await this.client.probe();
    const health = reachable ? await this.getHealth(this.resourceId) : undefined;
    return [{
      providerId: this.id,
      id: this.resourceId,
      type: this.type,
      state: reachable ? health?.status === 'healthy' ? 'active' : 'degraded' : 'unavailable',
      addresses: [],
      dnsServers: [],
      capabilities: this.capabilities(),
      health,
      priority: 45,
      metadata: {
        vendor: 'SpaceX',
        technology: 'Starlink',
        target: 'local-dish-api',
        targetConfigured: true,
        integrationMode: 'monitor-only',
      },
    }];
  }

  async getState(resourceId = this.resourceId): Promise<ConnectivityState> {
    this.assertResource(resourceId);
    const health = await this.getHealth(resourceId);
    return health.status === 'healthy' ? 'active' : health.status === 'degraded' ? 'degraded' : 'failed';
  }

  async getHealth(resourceId = this.resourceId): Promise<ConnectivityHealth> {
    this.assertResource(resourceId);
    const checkedAt = new Date().toISOString();
    const reachable = await this.client.probe();
    if (!reachable) {
      return {
        score: 0,
        status: 'unhealthy',
        internetReachable: false,
        gatewayReachable: false,
        checkedAt,
        source: 'provider',
        factors: { dishApiReachable: false },
      };
    }

    const status = await this.client.getStatus();
    this.lastStatus = status;
    if (!status) {
      return {
        score: 35,
        status: 'degraded',
        gatewayReachable: true,
        checkedAt,
        source: 'provider',
        factors: { dishApiReachable: true, telemetryAvailable: false },
      };
    }

    const score = calculateScore(status, this.minimumHealthyScore);
    return {
      score,
      status: score >= this.minimumHealthyScore ? 'healthy' : 'degraded',
      latencyMs: status.latencyMs,
      packetLoss: status.packetLoss,
      bandwidthMbps: status.downloadMbps,
      internetReachable: isOnlineState(status.state),
      gatewayReachable: true,
      checkedAt,
      source: 'provider',
      factors: {
        dishState: status.state,
        uploadMbps: status.uploadMbps,
        obstructionPercent: status.obstructionPercent,
        uptimeSeconds: status.uptimeSeconds,
      },
    };
  }

  async connect(resourceId: string): Promise<ConnectivityOperationResult> {
    this.assertResource(resourceId);
    const health = await this.getHealth(resourceId);
    return health.status === 'healthy' || health.status === 'degraded'
      ? { ok: true, resourceId, state: health.status === 'healthy' ? 'active' : 'degraded', metadata: { operation: 'verify-uplink' } }
      : { ok: false, resourceId, state: 'failed', error: 'Starlink dish is not reachable' };
  }

  async disconnect(resourceId: string): Promise<ConnectivityOperationResult> {
    this.assertResource(resourceId);
    return { ok: false, resourceId, state: 'active', error: 'Starlink provider does not own dish power or link lifecycle' };
  }

  async activate(resourceId: string): Promise<ConnectivityOperationResult> {
    return this.connect(resourceId);
  }

  async deactivate(resourceId: string): Promise<ConnectivityOperationResult> {
    return this.disconnect(resourceId);
  }

  getLastStatus(): StarlinkStatusSnapshot | undefined {
    return this.lastStatus;
  }

  private assertResource(resourceId: string): void {
    if (resourceId !== this.resourceId) throw new Error(`Unknown Starlink resource: ${resourceId}`);
  }
}

function parseStatus(root: Record<string, unknown>): StarlinkStatusSnapshot {
  const status = asRecord(root.dish_get_status) ?? asRecord(root.get_status) ?? root;
  return {
    state: asString(status.state),
    latencyMs: firstNumber(status.pop_ping_latency_ms, status.pop_ping_latency),
    packetLoss: firstNumber(status.pop_ping_drop_rate, status.packet_loss, status.packetLoss),
    downloadMbps: bitsToMbps(firstNumber(status.downlink_throughput_bps, status.downlink_throughput)),
    uploadMbps: bitsToMbps(firstNumber(status.uplink_throughput_bps, status.uplink_throughput)),
    obstructionPercent: firstNumber(status.obstruction_percent, asRecord(status.obstruction_stats)?.fraction_obstructed !== undefined ? Number(asRecord(status.obstruction_stats)?.fraction_obstructed) * 100 : undefined),
    uptimeSeconds: firstNumber(status.uptime_seconds, status.uptime),
    raw: root,
  };
}

function calculateScore(status: StarlinkStatusSnapshot, minimumHealthyScore: number): number {
  let score = 100;
  if (status.packetLoss !== undefined) score -= Math.min(45, Math.max(0, status.packetLoss) * 3);
  if (status.latencyMs !== undefined) score -= Math.min(30, Math.max(0, status.latencyMs - 40) * 0.15);
  if (status.obstructionPercent !== undefined) score -= Math.min(35, Math.max(0, status.obstructionPercent) * 1.5);
  if (!isOnlineState(status.state)) score -= 50;
  const rounded = Math.max(0, Math.min(100, Math.round(score)));
  return rounded >= minimumHealthyScore ? rounded : rounded;
}

function isOnlineState(state: string | undefined): boolean {
  if (!state) return true;
  return /connected|online|ready|active/i.test(state);
}

function bitsToMbps(value: number | undefined): number | undefined {
  return value === undefined ? undefined : value / 1_000_000;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}
