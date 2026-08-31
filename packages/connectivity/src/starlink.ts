import { createConnection } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  ConnectivityCapability,
  ConnectivityHealth,
  ConnectivityOperationResult,
  ConnectivityProvider,
  ConnectivityResource,
  ConnectivityState,
} from './index.js';

const execFileAsync = promisify(execFile);
const DEFAULT_TARGET = '192.168.100.1:9200';
const DEFAULT_GRPCURL = 'grpcurl';
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_RESOURCE_ID = 'starlink-dish';
const DEFAULT_HEALTHY_SCORE = 60;
const GRPC_METHOD = 'SpaceX.API.Device.Device/Handle';
const STARLINK_CAPABILITIES: ConnectivityCapability[] = ['monitor','health-check','supports-ipv4','supports-ipv6','supports-default-route','supports-dns','supports-tunneling'];

export interface StarlinkCommandResult { stdout: string; stderr: string; exitCode: number; }
export interface StarlinkCommandRunner { run(command: string, args: string[], options?: { timeoutMs?: number }): Promise<StarlinkCommandResult>; }
export interface StarlinkProviderOptions { commandRunner?: StarlinkCommandRunner; target?: string; grpcurlCommand?: string; resourceId?: string; timeoutMs?: number; minimumHealthyScore?: number; }
export interface StarlinkStatusSnapshot {
  state?: string; latencyMs?: number; packetLoss?: number; downloadMbps?: number; uploadMbps?: number;
  obstructionPercent?: number; uptimeSeconds?: number; raw: Record<string, unknown>;
}

export class NodeStarlinkCommandRunner implements StarlinkCommandRunner {
  async run(command: string, args: string[], options: { timeoutMs?: number } = {}): Promise<StarlinkCommandResult> {
    try {
      const result = await execFileAsync(command, args, { timeout: options.timeoutMs, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
      return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
    } catch (error) {
      const failure = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number | string };
      return { stdout: failure.stdout ?? '', stderr: failure.stderr ?? failure.message ?? 'command failed', exitCode: typeof failure.code === 'number' ? failure.code : 1 };
    }
  }
}

export class StarlinkDishClient {
  private readonly target: string; private readonly grpcurlCommand: string; private readonly timeoutMs: number;
  constructor(options: StarlinkProviderOptions = {}) {
    this.target = options.target ?? DEFAULT_TARGET; this.grpcurlCommand = options.grpcurlCommand ?? DEFAULT_GRPCURL; this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!/^\[[0-9a-fA-F:]+\]:\d+$|^[^:]+:\d+$/.test(this.target)) throw new Error('Invalid Starlink gRPC target');
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs <= 0) throw new Error('Starlink timeoutMs must be positive');
  }
  async probe(): Promise<boolean> {
    const separator = this.target.lastIndexOf(':');
    const host = this.target.startsWith('[') ? this.target.slice(1, this.target.indexOf(']')) : this.target.slice(0, separator);
    const port = Number(this.target.slice(separator + 1));
    return new Promise((resolve) => {
      const socket = createConnection({ host, port });
      const timer = setTimeout(() => { socket.destroy(); resolve(false); }, this.timeoutMs);
      socket.once('connect', () => { clearTimeout(timer); socket.destroy(); resolve(true); });
      socket.once('error', () => { clearTimeout(timer); socket.destroy(); resolve(false); });
    });
  }
  async getStatus(runner: StarlinkCommandRunner): Promise<StarlinkStatusSnapshot | undefined> {
    const result = await runner.run(this.grpcurlCommand, ['-plaintext','-format','json','-d','{"get_status":{}}',this.target,GRPC_METHOD], { timeoutMs: this.timeoutMs });
    if (result.exitCode !== 0 || !result.stdout.trim()) return undefined;
    try { return parseStatus(JSON.parse(result.stdout) as Record<string, unknown>); } catch { return undefined; }
  }
}

export class StarlinkProvider implements ConnectivityProvider {
  readonly id = 'starlink'; readonly type = 'custom' as const;
  private readonly client: StarlinkDishClient; private readonly commandRunner: StarlinkCommandRunner;
  private readonly resourceId: string; private readonly minimumHealthyScore: number; private lastStatus: StarlinkStatusSnapshot | undefined;
  constructor(options: StarlinkProviderOptions = {}) {
    this.client = new StarlinkDishClient(options); this.commandRunner = options.commandRunner ?? new NodeStarlinkCommandRunner();
    this.resourceId = options.resourceId ?? DEFAULT_RESOURCE_ID; this.minimumHealthyScore = options.minimumHealthyScore ?? DEFAULT_HEALTHY_SCORE;
    if (!Number.isInteger(this.minimumHealthyScore) || this.minimumHealthyScore < 0 || this.minimumHealthyScore > 100) throw new Error('Starlink minimumHealthyScore must be 0..100');
  }
  capabilities(): ConnectivityCapability[] { return [...STARLINK_CAPABILITIES]; }
  async discover(): Promise<ConnectivityResource[]> {
    const reachable = await this.client.probe(); const health = reachable ? await this.getHealth(this.resourceId) : undefined;
    const resource: ConnectivityResource = { providerId: this.id, id: this.resourceId, type: this.type,
      state: reachable ? health?.status === 'healthy' ? 'active' : 'degraded' : 'unavailable', addresses: [], dnsServers: [], capabilities: this.capabilities(), priority: 45,
      metadata: { vendor: 'SpaceX', technology: 'Starlink', localApiTarget: '192.168.100.1:9200', integrationMode: 'monitor-only' } };
    if (health !== undefined) resource.health = health;
    return [resource];
  }
  async getState(resourceId = this.resourceId): Promise<ConnectivityState> { this.assertResource(resourceId); const health = await this.getHealth(resourceId); return health.status === 'healthy' ? 'active' : health.status === 'degraded' ? 'degraded' : 'failed'; }
  async getHealth(resourceId = this.resourceId): Promise<ConnectivityHealth> {
    this.assertResource(resourceId); const checkedAt = new Date().toISOString(); const reachable = await this.client.probe();
    if (!reachable) return { score: 0, status: 'unhealthy', internetReachable: false, gatewayReachable: false, checkedAt, source: 'provider', factors: { dishApiReachable: false } };
    const status = await this.client.getStatus(this.commandRunner); this.lastStatus = status;
    if (!status) return { score: 35, status: 'degraded', gatewayReachable: true, checkedAt, source: 'provider', factors: { dishApiReachable: true, telemetryAvailable: false } };
    const score = calculateScore(status); const health: ConnectivityHealth = { score, status: score >= this.minimumHealthyScore ? 'healthy' : 'degraded', internetReachable: isOnlineState(status.state), gatewayReachable: true, checkedAt, source: 'provider', factors: { dishState: status.state, uploadMbps: status.uploadMbps, obstructionPercent: status.obstructionPercent, uptimeSeconds: status.uptimeSeconds } };
    if (status.latencyMs !== undefined) health.latencyMs = status.latencyMs;
    if (normalizePacketLoss(status.packetLoss) !== undefined) health.packetLoss = normalizePacketLoss(status.packetLoss);
    if (status.downloadMbps !== undefined) health.bandwidthMbps = status.downloadMbps;
    return health;
  }
  async connect(resourceId: string): Promise<ConnectivityOperationResult> { this.assertResource(resourceId); const health = await this.getHealth(resourceId); return health.status === 'healthy' || health.status === 'degraded' ? { ok: true, resourceId, state: health.status === 'healthy' ? 'active' : 'degraded', metadata: { operation: 'verify-uplink' } } : { ok: false, resourceId, state: 'failed', error: 'Starlink dish is not reachable' }; }
  async disconnect(resourceId: string): Promise<ConnectivityOperationResult> { this.assertResource(resourceId); return { ok: false, resourceId, state: 'active', error: 'Starlink provider does not own dish power or link lifecycle' }; }
  async activate(resourceId: string): Promise<ConnectivityOperationResult> { return this.connect(resourceId); }
  async deactivate(resourceId: string): Promise<ConnectivityOperationResult> { return this.disconnect(resourceId); }
  getLastStatus(): StarlinkStatusSnapshot | undefined { return this.lastStatus; }
  private assertResource(resourceId: string): void { if (resourceId !== this.resourceId) throw new Error(`Unknown Starlink resource: ${resourceId}`); }
}

function parseStatus(root: Record<string, unknown>): StarlinkStatusSnapshot {
  const status = asRecord(root.dish_get_status) ?? asRecord(root.get_status) ?? root; const obstructionStats = asRecord(status.obstruction_stats); const obstructionFraction = firstNumber(obstructionStats?.fraction_obstructed);
  const snapshot: StarlinkStatusSnapshot = { raw: root };
  const state = asString(status.state); if (state !== undefined) snapshot.state = state;
  const latency = firstNumber(status.pop_ping_latency_ms, status.pop_ping_latency); if (latency !== undefined) snapshot.latencyMs = latency;
  const loss = firstNumber(status.pop_ping_drop_rate, status.packet_loss, status.packetLoss); if (loss !== undefined) snapshot.packetLoss = loss;
  const download = bitsToMbps(firstNumber(status.downlink_throughput_bps, status.downlink_throughput)); if (download !== undefined) snapshot.downloadMbps = download;
  const upload = bitsToMbps(firstNumber(status.uplink_throughput_bps, status.uplink_throughput)); if (upload !== undefined) snapshot.uploadMbps = upload;
  const obstruction = firstNumber(status.obstruction_percent) ?? (obstructionFraction === undefined ? undefined : obstructionFraction * 100); if (obstruction !== undefined) snapshot.obstructionPercent = obstruction;
  const uptime = firstNumber(status.uptime_seconds, status.uptime); if (uptime !== undefined) snapshot.uptimeSeconds = uptime;
  return snapshot;
}
function calculateScore(status: StarlinkStatusSnapshot): number { let score = 100; const packetLoss = normalizePacketLoss(status.packetLoss); if (packetLoss !== undefined) score -= Math.min(45, packetLoss * 3); if (status.latencyMs !== undefined) score -= Math.min(30, Math.max(0, status.latencyMs - 40) * 0.15); if (status.obstructionPercent !== undefined) score -= Math.min(35, Math.max(0, status.obstructionPercent) * 1.5); if (!isOnlineState(status.state)) score -= 50; return Math.max(0, Math.min(100, Math.round(score))); }
function normalizePacketLoss(value: number | undefined): number | undefined { if (value === undefined) return undefined; return value <= 1 ? value * 100 : value; }
function isOnlineState(state: string | undefined): boolean { if (!state) return true; return /connected|online|ready|active/i.test(state); }
function bitsToMbps(value: number | undefined): number | undefined { return value === undefined ? undefined : value / 1_000_000; }
function asRecord(value: unknown): Record<string, unknown> | undefined { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function asString(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined; }
function firstNumber(...values: unknown[]): number | undefined { for (const value of values) if (typeof value === 'number' && Number.isFinite(value)) return value; return undefined; }
