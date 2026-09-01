import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Application } from '@irp/core';
import { loadConfig } from '@irp/config';
import { createLogger } from '@irp/logger';
import {
  ResilienceRuntime,
  RuntimeScheduler,
  type ObservationProvider,
  type ObservationProviderResult,
  type RuntimeContext,
  type RuntimeSchedulerConfig,
} from '@irp/resilience-runtime';

const execFileAsync = promisify(execFile);

export type DaemonLifecycle =
  'created' | 'initialized' | 'ready' | 'running' | 'stopping' | 'stopped';

const makeObservation = (context: RuntimeContext, metric: string, available: boolean) => ({
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
      observations: results.map(({ metric, available }) => makeObservation(context, metric, available)),
      collectedAt: new Date().toISOString(),
      errors: results.filter((r) => !r.available).map((r) => `${r.metric} probe unavailable`),
    };
  }
}

export class RuntimeDaemonHost {
  lifecycle: DaemonLifecycle = 'created';
  readonly runtime = new ResilienceRuntime([new LinuxObservationProvider()], { runtimeId: 'daemon-runtime' });
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
  async initialize() {
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
      capabilities: this.runtime.capabilities(),
    };
  }
}

export const createDaemon = (): Application => {
  const config = loadConfig();
  const logger = createLogger(config.logger.level);
  return new Application(config, logger);
};
export const createRuntimeDaemonHost = (config?: Partial<RuntimeSchedulerConfig>) =>
  new RuntimeDaemonHost(config);
if (process.argv[1]?.endsWith('index.js')) {
  const daemon = createDaemon();
  const host = createRuntimeDaemonHost({ enabled: process.env.IRP_RUNTIME_ENABLED === '1' });
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
