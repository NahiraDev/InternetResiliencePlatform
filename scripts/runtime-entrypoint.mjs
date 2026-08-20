#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { loadConfig } from '../packages/config/dist/index.js';
import { createMetricsPlatform } from '../packages/metrics/dist/index.js';
import { initializeOpenTelemetry } from '../packages/telemetry/dist/index.js';

const log = (level, msg, extra = {}) => console.log(JSON.stringify({ level, msg, ...extra }));
const fail = (msg, extra = {}) => {
  console.error(JSON.stringify({ level: 'error', msg, ...extra }));
  process.exit(1);
};
const required = ['DATABASE_URL', 'JWT_SECRET'];
for (const name of required)
  if (!process.env[name]) fail(`${name} is required for production startup`);

for (const path of ['/app/.cache/node/corepack', '/app/.local/share/pnpm', '/app/tmp']) {
  try {
    await access(path, constants.R_OK | constants.W_OK);
  } catch {
    fail('runtime writable path is not accessible', { path });
  }
}

let config;
try {
  config = loadConfig();
  log('info', 'configuration validated', {
    environment: config.app.environment,
    apiHost: config.api.host,
    apiPort: config.api.port,
  });
} catch (error) {
  fail('configuration validation failed', {
    error: error instanceof Error ? error.message : String(error),
  });
}

const run = (command, args, env = process.env) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env });
    child.on('error', reject);
    child.on('exit', (code, signal) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} ${args.join(' ')} failed with ${signal ?? code}`)),
    );
  });

try {
  await run('node', ['scripts/wait-for-database.mjs']);
  log('info', 'database connection established');
  await run('pnpm', ['--filter', '@irp/database', 'prisma:migrate:deploy'], {
    ...process.env,
    PRISMA_GENERATE_SKIP_AUTOINSTALL: '1',
  });
  log('info', 'database migrations verified');
} catch (error) {
  fail('startup initialization failed', {
    error: error instanceof Error ? error.message : String(error),
  });
}

const metrics = createMetricsPlatform();
metrics.define({
  name: 'irp_runtime_startup_total',
  type: 'counter',
  description: 'Successful production runtime startup attempts',
});
metrics.record('irp_runtime_startup_total', 1);

let telemetry;
try {
  telemetry = initializeOpenTelemetry(
    {
      enabled: config.telemetry.enabled,
      serviceName: config.telemetry.serviceName,
      serviceVersion: config.app.version,
      environment: config.app.environment,
      ...(config.telemetry.otlpEndpoint ? { otlpEndpoint: config.telemetry.otlpEndpoint } : {}),
      ...(config.telemetry.otlpTracesEndpoint
        ? { otlpTracesEndpoint: config.telemetry.otlpTracesEndpoint }
        : {}),
      ...(config.telemetry.otlpMetricsEndpoint
        ? { otlpMetricsEndpoint: config.telemetry.otlpMetricsEndpoint }
        : {}),
      ...(config.telemetry.otlpHeaders ? { otlpHeaders: config.telemetry.otlpHeaders } : {}),
      sampleRatio: config.telemetry.sampleRatio,
      exportIntervalMs: config.telemetry.exportIntervalMs,
      exportTimeoutMs: config.telemetry.exportTimeoutMs,
    },
    metrics,
  );
  log('info', 'OpenTelemetry initialized', {
    enabled: telemetry.state.enabled,
    traceExporterConfigured: telemetry.state.traceExporterConfigured,
    metricExporterConfigured: telemetry.state.metricExporterConfigured,
    serviceName: telemetry.state.serviceName,
  });
} catch (error) {
  fail('OpenTelemetry initialization failed', {
    error: error instanceof Error ? error.message : String(error),
  });
}

const { buildServer } = await import('../apps/api/dist/index.js');
const telemetryModule = await import('../packages/telemetry/dist/index.js');

const metricLabels = (labels) => (labels && typeof labels === 'object' ? { ...labels } : {});
const wrapPrometheusMetric = (metric, type) => {
  if (!metric || metric.__irpOpenTelemetryWrapped) return;
  const name = metric.name;
  const description = metric.help ?? `Prometheus ${type} metric ${name}`;
  metrics.define({ name, type, description });
  const marker = '__irpOpenTelemetryWrapped';
  Object.defineProperty(metric, marker, { value: true });

  if (type === 'counter') {
    const originalInc = metric.inc.bind(metric);
    metric.inc = (labelsOrValue, maybeValue) => {
      const labels = typeof labelsOrValue === 'number' ? {} : metricLabels(labelsOrValue);
      const value = typeof labelsOrValue === 'number' ? labelsOrValue : maybeValue ?? 1;
      originalInc(labelsOrValue, maybeValue);
      metrics.record(name, value, labels);
      return metric;
    };
    return;
  }

  if (type === 'histogram') {
    const originalObserve = metric.observe.bind(metric);
    metric.observe = (labelsOrValue, maybeValue) => {
      const labels = typeof labelsOrValue === 'number' ? {} : metricLabels(labelsOrValue);
      const value = typeof labelsOrValue === 'number' ? labelsOrValue : maybeValue;
      originalObserve(labelsOrValue, maybeValue);
      if (typeof value === 'number') metrics.record(name, value, labels);
      return metric;
    };
    return;
  }

  const gaugeState = new Map();
  const keyFor = (labels) => JSON.stringify(metricLabels(labels));
  const updateGauge = (labels, delta, absolute = false) => {
    const normalized = metricLabels(labels);
    const key = keyFor(normalized);
    const current = gaugeState.get(key) ?? 0;
    const next = absolute ? delta : current + delta;
    gaugeState.set(key, next);
    metrics.record(name, next, normalized);
  };
  const originalSet = metric.set.bind(metric);
  const originalInc = metric.inc.bind(metric);
  const originalDec = metric.dec.bind(metric);
  metric.set = (labelsOrValue, maybeValue) => {
    const labels = typeof labelsOrValue === 'number' ? {} : metricLabels(labelsOrValue);
    const value = typeof labelsOrValue === 'number' ? labelsOrValue : maybeValue;
    originalSet(labelsOrValue, maybeValue);
    if (typeof value === 'number') updateGauge(labels, value, true);
    return metric;
  };
  metric.inc = (labelsOrValue, maybeValue) => {
    const labels = typeof labelsOrValue === 'number' ? {} : metricLabels(labelsOrValue);
    const value = typeof labelsOrValue === 'number' ? labelsOrValue : maybeValue ?? 1;
    originalInc(labelsOrValue, maybeValue);
    updateGauge(labels, value);
    return metric;
  };
  metric.dec = (labelsOrValue, maybeValue) => {
    const labels = typeof labelsOrValue === 'number' ? {} : metricLabels(labelsOrValue);
    const value = typeof labelsOrValue === 'number' ? labelsOrValue : maybeValue ?? 1;
    originalDec(labelsOrValue, maybeValue);
    updateGauge(labels, -value);
    return metric;
  };
};

if (telemetry.state.metricExporterConfigured) {
  wrapPrometheusMetric(telemetryModule.httpRequestTotal, 'counter');
  wrapPrometheusMetric(telemetryModule.httpActiveRequests, 'gauge');
  wrapPrometheusMetric(telemetryModule.httpRequestDuration, 'histogram');
  wrapPrometheusMetric(telemetryModule.dependencyFailuresTotal, 'counter');
  wrapPrometheusMetric(telemetryModule.dependencyLatencyMs, 'histogram');
  wrapPrometheusMetric(telemetryModule.telemetryFailuresTotal, 'counter');
  wrapPrometheusMetric(telemetryModule.probeSuccessTotal, 'counter');
  wrapPrometheusMetric(telemetryModule.probeFailureTotal, 'counter');
  wrapPrometheusMetric(telemetryModule.networkLatencyMs, 'histogram');
  wrapPrometheusMetric(telemetryModule.networkHealthScore, 'gauge');
  wrapPrometheusMetric(telemetryModule.runtimeEventLoopLagMs, 'gauge');
}

const server = await buildServer();
let shuttingDown = false;
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  log('info', 'shutdown requested', { signal });
  try {
    await server.close();
    await telemetry.shutdown();
    log('info', 'shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'shutdown failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exit(1);
  }
};
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

try {
  await server.listen({ host: config.api.host, port: config.api.port });
  log('info', 'HTTP server started', { host: config.api.host, port: config.api.port });
  log('info', 'application ready');
} catch (error) {
  fail('HTTP server failed to start', {
    error: error instanceof Error ? error.message : String(error),
  });
}
