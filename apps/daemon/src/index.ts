import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Application } from '@irp/core';
import { loadConfig } from '@irp/config';
import { createBuiltinProviders, IntelligentDnsEngine } from '@irp/dns';
import { InMemoryGatewayRegistry } from '@irp/gateway-registry';
import { createLogger } from '@irp/logger';
import { NetworkMonitoringService } from '@irp/network';
import { builtinPlugins } from '@irp/plugin-samples';
import { PluginManager } from '@irp/plugin-manager';
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
import { TunnelProviderRegistry } from '@irp/tunnel';

const execFileAsync = promisify(execFile);

export type DaemonLifecycle =
  | 'created'
  | 'initialized'
  | 'ready'
  | 'running'
  | 'stopping'
  | 'stopped';

export class LinuxObservationProvider implements ObservationProvider {
  readonly id = 'linux-network-monitor';

  constructor(private readonly monitor = new NetworkMonitoringService()) {}

  async collect(context: RuntimeContext): Promise<ObservationProviderResult> {
    if (process.platform !== 'linux') {
      return {
        providerId: this.id,
        observations: [],
        collectedAt: new Date().toISOString(),
        errors: ['linux network observation is unavailable on non-linux platforms'],
      };
    }

    const snapshot = await this.monitor.runOnce();
    const observations: Observation[] = snapshot.measurements.map((measurement) => ({
      id: `linux-${measurement.id}`,
      schemaVersion: 1,
      createdAt: measurement.timestamp,
      correlationId: context.correlationId,
      source: 'irp-daemon-network-monitor',
      metadata: {
        ...measurement.metadata,
        probeName: measurement.probeType,
        success: measurement.success,
      },
      category: measurement.probeType === 'dns' ? 'dns' : 'network',
      metric:
        measurement.probeType === 'dns'
          ? 'dns_lookup_ms'
          : measurement.probeType === 'tcp'
            ? 'latency_ms'
            : measurement.probeType === 'packet_loss'
              ? 'packet_loss_ratio'
              : measurement.probeType === 'ip'
                ? 'ipv4_connectivity'
                : measurement.probeType === 'http'
                  ? 'http_response_ms'
                  : `network_${measurement.probeType}_latency_ms`,
      value:
        measurement.probeType === 'packet_loss' && typeof measurement.metadata.lossRatio === 'number'
          ? measurement.metadata.lossRatio
          : measurement.probeType === 'ip' && typeof measurement.metadata.ipv4 === 'boolean'
            ? measurement.metadata.ipv4
            : measurement.latency,
      timestamp: measurement.timestamp,
      freshnessMs: 0,
      confidence: measurement.success ? 0.95 : 0.25,
      severity: measurement.success ? 'info' : 'warning',
      status: measurement.success ? 'healthy' : 'degraded',
    }));

    const quality = snapshot.score.score;
    observations.push({
      id: `linux-quality-${context.correlationId}`,
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      correlationId: context.correlationId,
      source: 'irp-daemon-network-monitor',
      metadata: { issueCount: snapshot.issues.length },
      category: 'network',
      metric: 'quality_score',
      value: quality,
      timestamp: new Date().toISOString(),
      freshnessMs: 0,
      confidence: 0.95,
      severity: quality >= 80 ? 'info' : quality >= 50 ? 'warning' : 'critical',
      status: quality >= 80 ? 'healthy' : quality >= 50 ? 'degraded' : 'failed',
    });

    const internetReachable = snapshot.measurements.some(
      (measurement) => (measurement.probeType === 'http' || measurement.probeType === 'tcp') && measurement.success,
    );
    observations.push({
      id: `linux-internet-${context.correlationId}`,
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      correlationId: context.correlationId,
      source: 'irp-daemon-network-monitor',
      metadata: {},
      category: 'network',
      metric: 'internet_reachable',
      value: internetReachable,
      timestamp: new Date().toISOString(),
      freshnessMs: 0,
      confidence: 0.95,
      severity: internetReachable ? 'info' : 'critical',
      status: internetReachable ? 'healthy' : 'failed',
    });

    return {
      providerId: this.id,
      observations,
      collectedAt: new Date().toISOString(),
      errors: snapshot.issues,
    };
  }
}

export class RuntimeDaemonHost {
  lifecycle: DaemonLifecycle = 'created';
  readonly connectivity = new ConnectivityManager();
  readonly routing = new RoutingEngine();
  readonly dnsProviders = createBuiltinProviders();
  readonly dns = new IntelligentDnsEngine(this.dnsProviders, {
    check: async (provider) => provider.health(),
  });
  readonly gateways = new InMemoryGatewayRegistry();
  readonly tunnels = new TunnelProviderRegistry();
  readonly plugins = new PluginManager();
  readonly networkMonitor = new NetworkMonitoringService();
  readonly observer = new LinuxObservationProvider(this.networkMonitor);
  readonly runtime = new ResilienceRuntime([this.observer], {
    runtimeId: 'daemon-runtime',
    networkControlPlane: {
      connectivity: this.connectivity,
      routing: this.routing,
      dns: {
        engine: this.dns,
        getActiveProviderId: () => this.dns.status().activeProviderId,
        applyProvider: async (provider) => this.applyDnsProvider(provider.id),
      },
    },
  });
  readonly scheduler: RuntimeScheduler;

  constructor(config: Partial<RuntimeSchedulerConfig> = {}) {
    this.scheduler = new RuntimeScheduler(this.runtime, {
      enabled: false,
      mode: 'safe',
      cycleIntervalMs: 30_000,
      maxConcurrentCycles: 1,
      cooldownMs: 5_000,
      executionBudgetMs: 10_000,
      ...config,
    });
  }

  private async applyDnsProvider(providerId: string): Promise<void> {
    const provider = this.dnsProviders.find((candidate) => candidate.id === providerId);
    if (!provider) throw new Error(`Unknown DNS provider: ${providerId}`);
    const active = this.connectivity.getActiveSource();
    const interfaceName = active?.interfaceName;
    if (process.platform !== 'linux' || !interfaceName) {
      throw new Error('live DNS switching requires a discovered Linux network interface');
    }
    const servers = provider.metadata().endpoints.ipv4;
    if (servers.length === 0) throw new Error(`DNS provider ${providerId} has no IPv4 resolver endpoints`);
    await execFileAsync('resolvectl', ['dns', interfaceName, ...servers], {
      timeout: 5_000,
      maxBuffer: 64 * 1024,
    });
    this.dns.selectProvider(providerId);
  }

  async initialize() {
    await this.connectivity.discoverResources();
    await this.dns.evaluate();
    await this.networkMonitor.runOnce();
    await this.plugins.installAll(builtinPlugins());
    this.lifecycle = 'initialized';
    this.lifecycle = 'ready';
  }

  async start() {
    if (this.lifecycle === 'created') await this.initialize();
    this.lifecycle = 'running';
    this.scheduler.start();
  }

  async stop() {
    this.lifecycle = 'stopping';
    this.scheduler.stop();
    this.networkMonitor.stop();
    this.lifecycle = 'stopped';
  }

  health() {
    const network = this.networkMonitor.runOnce();
    return {
      lifecycle: this.lifecycle,
      scheduler: this.scheduler.status(),
      runtimeId: this.runtime.runtimeId,
      instanceId: this.runtime.instanceId,
      connectivityProviders: this.connectivity.getProviders().map((provider) => provider.id),
      connectivitySources: this.connectivity.getAvailableSources().map((source) => source.sourceId),
      dns: {
        providers: this.dnsProviders.map((provider) => provider.id),
        activeProviderId: this.dns.status().activeProviderId,
      },
      gatewayCount: this.gateways.list().length,
      tunnelProviderIds: this.tunnels.list().map((provider) => provider.id),
      pluginCount: this.plugins.graph().length,
      networkMonitor: network.then((snapshot) => ({
        status: snapshot.status,
        qualityScore: snapshot.score.score,
        measurements: snapshot.measurements.length,
        issues: snapshot.issues,
      })),
      capabilities: this.runtime.capabilities(),
    };
  }
}

export const createDaemon = (): Application => {
  const config = loadConfig();
  const logger = createLogger(config.logger.level);
  return new Application(config, logger);
};

export const createRuntimeDaemonHost = (
  config?: Partial<RuntimeSchedulerConfig>,
) => new RuntimeDaemonHost(config);

if (process.argv[1]?.endsWith('index.js')) {
  const daemon = createDaemon();
  const host = createRuntimeDaemonHost({
    enabled: process.env.IRP_RUNTIME_ENABLED === '1',
  });
  await host.start();
  await daemon.start();
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    daemon.logger.info('shutdown signal received', { signal });
    await host.stop();
    await daemon.stop();
    process.exit(0);
  };
  process.on('SIGTERM', (signal) => void shutdown(signal));
  process.on('SIGINT', (signal) => void shutdown(signal));
  process.on('SIGHUP', () => void daemon.reload(loadConfig()));
}
