import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Application, createAllBuiltinProviders, IntelligentDnsEngine } from '@irp/core';
import { loadConfig } from '@irp/config';
import { ConnectivityManager, type ConnectivitySource } from '@irp/connectivity';
import { createLogger } from '@irp/logger';
import { RoutingEngine } from '@irp/routing';
import {
  ResilienceRuntime,
  RuntimeScheduler,
  type Observation,
  type ObservationProvider,
  type ObservationProviderResult,
  type RuntimeContext,
  type RuntimeSchedulerConfig,
} from '@irp/resilience-runtime';

const execFileAsync = promisify(execFile);

type Health = {
  score?: number;
  status?: string;
  latencyMs?: number;
  packetLoss?: number;
  jitterMs?: number;
  internetReachable?: boolean;
  dnsReachable?: boolean;
  gatewayReachable?: boolean;
  ipv4?: boolean;
  ipv6?: boolean;
};

const observationsForSource = (context: RuntimeContext, source: ConnectivitySource, health: Health): Observation[] => {
  const now = new Date().toISOString();
  const result: Observation[] = [];
  const quality = Number.isFinite(health.score) ? health.score! : 0;
  result.push({
    id: `connectivity-${source.sourceId}-quality-${context.correlationId}`,
    schemaVersion: 1,
    createdAt: now,
    correlationId: context.correlationId,
    source: 'irp-daemon-connectivity',
    metadata: { sourceId: source.sourceId, providerId: source.providerId, resourceId: source.id, interfaceName: source.interfaceName, gateway: source.gateway },
    category: 'network',
    metric: 'quality_score',
    value: quality,
    timestamp: now,
    freshnessMs: 0,
    confidence: health.status ? 0.9 : 0.5,
    severity: health.status === 'healthy' ? 'info' : health.status === 'unhealthy' ? 'critical' : 'warning',
    status: health.status === 'healthy' ? 'healthy' : health.status === 'unhealthy' ? 'failed' : 'degraded',
  });
  if (typeof health.latencyMs === 'number') result.push({ id: `connectivity-${source.sourceId}-latency-${context.correlationId}`, schemaVersion: 1, createdAt: now, correlationId: context.correlationId, source: 'irp-daemon-connectivity', metadata: { sourceId: source.sourceId }, category: 'network', metric: 'latency_ms', value: health.latencyMs, timestamp: now, freshnessMs: 0, confidence: 0.9, severity: 'info', status: 'healthy' });
  if (typeof health.packetLoss === 'number') result.push({ id: `connectivity-${source.sourceId}-loss-${context.correlationId}`, schemaVersion: 1, createdAt: now, correlationId: context.correlationId, source: 'irp-daemon-connectivity', metadata: { sourceId: source.sourceId }, category: 'network', metric: 'packet_loss_ratio', value: health.packetLoss, timestamp: now, freshnessMs: 0, confidence: 0.9, severity: 'info', status: 'healthy' });
  if (typeof health.dnsReachable === 'boolean') result.push({ id: `connectivity-${source.sourceId}-dns-${context.correlationId}`, schemaVersion: 1, createdAt: now, correlationId: context.correlationId, source: 'irp-daemon-connectivity', metadata: { sourceId: source.sourceId }, category: 'dns', metric: 'dns_reachable', value: health.dnsReachable, timestamp: now, freshnessMs: 0, confidence: 0.9, severity: health.dnsReachable ? 'info' : 'warning', status: health.dnsReachable ? 'healthy' : 'degraded' });
  if (typeof health.ipv4 === 'boolean') result.push({ id: `connectivity-${source.sourceId}-ipv4-${context.correlationId}`, schemaVersion: 1, createdAt: now, correlationId: context.correlationId, source: 'irp-daemon-connectivity', metadata: { sourceId: source.sourceId }, category: 'network', metric: 'ipv4_connectivity', value: health.ipv4, timestamp: now, freshnessMs: 0, confidence: 0.9, severity: health.ipv4 ? 'info' : 'warning', status: health.ipv4 ? 'healthy' : 'degraded' });
  if (typeof health.ipv6 === 'boolean') result.push({ id: `connectivity-${source.sourceId}-ipv6-${context.correlationId}`, schemaVersion: 1, createdAt: now, correlationId: context.correlationId, source: 'irp-daemon-connectivity', metadata: { sourceId: source.sourceId }, category: 'network', metric: 'ipv6_connectivity', value: health.ipv6, timestamp: now, freshnessMs: 0, confidence: 0.9, severity: health.ipv6 ? 'info' : 'warning', status: health.ipv6 ? 'healthy' : 'degraded' });
  return result;
};

export class LinuxObservationProvider implements ObservationProvider {
  readonly id = 'linux-connectivity-observer';
  constructor(private readonly connectivity: ConnectivityManager) {}
  async collect(context: RuntimeContext): Promise<ObservationProviderResult> {
    if (process.platform !== 'linux') return { providerId: this.id, observations: [], collectedAt: new Date().toISOString(), errors: ['linux connectivity observation is unavailable on non-linux platforms'] };
    await this.connectivity.discoverResources();
    const sources = this.connectivity.getAvailableSources();
    const observations: Observation[] = [];
    const errors: string[] = [];
    await Promise.all(sources.map(async (source) => {
      try { observations.push(...observationsForSource(context, source, await this.connectivity.registry.get(source.providerId).getHealth(source.id))); }
      catch (error) { errors.push(`${source.sourceId}: ${error instanceof Error ? error.message : 'health probe failed'}`); }
    }));
    const active = this.connectivity.getActiveSource();
    const now = new Date().toISOString();
    observations.push({ id: `connectivity-internet-${context.correlationId}`, schemaVersion: 1, createdAt: now, correlationId: context.correlationId, source: 'irp-daemon-connectivity', metadata: { activeSourceId: active?.sourceId }, category: 'network', metric: 'internet_reachable', value: Boolean(active && sources.some((source) => source.sourceId === active.sourceId)), timestamp: now, freshnessMs: 0, confidence: active ? 0.95 : 0.5, severity: active ? 'info' : 'critical', status: active ? 'healthy' : 'failed' });
    return { providerId: this.id, observations, collectedAt: now, errors };
  }
}

export class RuntimeDaemonHost {
  lifecycle: 'created' | 'initialized' | 'ready' | 'running' | 'stopping' | 'stopped' = 'created';
  readonly connectivity = new ConnectivityManager();
  readonly routing = new RoutingEngine();
  readonly dnsProviders = createAllBuiltinProviders();
  readonly dns = new IntelligentDnsEngine(this.dnsProviders, { check: async (provider) => provider.health() });
  readonly observer = new LinuxObservationProvider(this.connectivity);
  readonly runtime = new ResilienceRuntime([this.observer], { runtimeId: 'daemon-runtime', networkControlPlane: { connectivity: this.connectivity, routing: this.routing, dns: { engine: this.dns, getActiveProviderId: () => this.dns.status().activeProviderId, applyProvider: async (provider) => this.applyDnsProvider(provider.id) } } });
  readonly scheduler: RuntimeScheduler;
  constructor(config: Partial<RuntimeSchedulerConfig> = {}) { this.scheduler = new RuntimeScheduler(this.runtime, { enabled: false, mode: 'safe', cycleIntervalMs: 30_000, maxConcurrentCycles: 1, cooldownMs: 5_000, executionBudgetMs: 10_000, ...config }); }
  private async applyDnsProvider(providerId: string): Promise<void> {
    const provider = this.dnsProviders.find((candidate) => candidate.id === providerId);
    if (!provider) throw new Error(`Unknown DNS provider: ${providerId}`);
    const active = this.connectivity.getActiveSource();
    const interfaceName = active?.interfaceName;
    if (process.platform !== 'linux' || !interfaceName) throw new Error('live DNS switching requires a discovered Linux network interface');
    const servers = provider.metadata().endpoints.ipv4;
    if (servers.length === 0) throw new Error(`DNS provider ${providerId} has no IPv4 resolver endpoints`);
    await execFileAsync('resolvectl', ['dns', interfaceName, ...servers], { timeout: 5_000, maxBuffer: 64 * 1024 });
    this.dns.selectProvider(providerId);
  }
  async initialize() { await this.connectivity.discoverResources(); await this.dns.evaluate(); this.lifecycle = 'ready'; }
  async start() { if (this.lifecycle === 'created') await this.initialize(); this.lifecycle = 'running'; this.scheduler.start(); }
  async stop() { this.lifecycle = 'stopping'; this.scheduler.stop(); this.lifecycle = 'stopped'; }
  health() { return { lifecycle: this.lifecycle, scheduler: this.scheduler.status(), runtimeId: this.runtime.runtimeId, instanceId: this.runtime.instanceId, connectivityProviders: this.connectivity.getProviders().map((provider) => provider.id), connectivitySources: this.connectivity.getAvailableSources().map((source) => source.sourceId), dns: { providers: this.dnsProviders.map((provider) => provider.id), activeProviderId: this.dns.status().activeProviderId }, capabilities: this.runtime.capabilities() }; }
}

export const createDaemon = (): Application => { const config = loadConfig(); const logger = createLogger(config.logger.level); return new Application(config, logger); };
export const createRuntimeDaemonHost = (config?: Partial<RuntimeSchedulerConfig>) => new RuntimeDaemonHost(config);

if (process.argv[1]?.endsWith('index.js')) {
  const daemon = createDaemon();
  const host = createRuntimeDaemonHost({ enabled: process.env.IRP_RUNTIME_ENABLED === '1' });
  await host.start(); await daemon.start();
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => { daemon.logger.info('shutdown signal received', { signal }); await host.stop(); await daemon.stop(); process.exit(0); };
  process.on('SIGTERM', (signal) => void shutdown(signal)); process.on('SIGINT', (signal) => void shutdown(signal)); process.on('SIGHUP', () => void daemon.reload(loadConfig()));
}
