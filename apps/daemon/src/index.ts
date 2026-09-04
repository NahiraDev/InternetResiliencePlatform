import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Application } from '@irp/core';
import { loadConfig } from '@irp/config';
import { createBuiltinProviders, IntelligentDnsEngine } from '@irp/dns';
import { InMemoryGatewayRegistry } from '@irp/gateway-registry';
import { createLogger } from '@irp/logger';
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

const makeObservation = (
  context: RuntimeContext,
  metric: string,
  available: boolean,
): Observation => ({
  id: `linux-${metric}-${context.correlationId}`,
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  correlationId: context.correlationId,
  source: 'irp-daemon-linux-observer',
  metadata: { platform: process.platform },
  category: metric === 'dns' ? 'dns' : 'platform',
  metric: `linux_${metric}_available`,
  value: available,
  timestamp: new Date().toISOString(),
  freshnessMs: 0,
  confidence: available ? 1 : 0.5,
  severity: available ? 'info' : 'warning',
  status: available ? 'healthy' : 'unknown',
});

export class LinuxObservationProvider implements ObservationProvider {
  readonly id = 'linux-system-observer';

  async collect(context: RuntimeContext): Promise<ObservationProviderResult> {
    if (process.platform !== 'linux') {
      return {
        providerId: this.id,
        observations: [],
        collectedAt: new Date().toISOString(),
        errors: ['linux system observation is unavailable on non-linux platforms'],
      };
    }
    const commands = [
      ['interfaces', 'ip', ['-brief', 'address']],
      ['routes', 'ip', ['-brief', 'route']],
      ['dns', 'resolvectl', ['status']],
    ] as const;
    const results = await Promise.all(
      commands.map(async ([metric, file, args]) => {
        try {
          await execFileAsync(file, args, { timeout: 5_000, maxBuffer: 64 * 1024 });
          return { metric, available: true };
        } catch {
          return { metric, available: false };
        }
      }),
    );
    return {
      providerId: this.id,
      observations: results.map(({ metric, available }) =>
        makeObservation(context, metric, available),
      ),
      collectedAt: new Date().toISOString(),
      errors: results
        .filter((r) => !r.available)
        .map((r) => `${r.metric} probe unavailable`),
    };
  }
}

export class RuntimeDaemonHost {
  lifecycle: DaemonLifecycle = 'created';
  readonly connectivity = new ConnectivityManager();
  readonly routing = new RoutingEngine();
  readonly dnsProviders = createBuiltinProviders();
  readonly dns = new IntelligentDnsEngine(
    this.dnsProviders,
    { check: async (provider) => provider.health() },
  );
  readonly gateways = new InMemoryGatewayRegistry();
  readonly tunnels = new TunnelProviderRegistry();
  readonly plugins = new PluginManager();
  readonly runtime = new ResilienceRuntime([new LinuxObservationProvider()], {
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
    this.lifecycle = 'stopped';
  }

  health() {
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
