#!/usr/bin/env node

const DEFAULT_BASE_URL = process.env.IRP_API_URL ?? 'http://127.0.0.1:8080';
const TIMEOUT_MS = Number(process.env.IRP_DIAGNOSTICS_TIMEOUT_MS ?? 5000);

const usage = () => {
  console.error('Usage: node scripts/operational-diagnostics.mjs [--url URL] [--timeout MS] [--strict]');
};

const parseArgs = (argv) => {
  const args = { baseUrl: DEFAULT_BASE_URL, timeout: TIMEOUT_MS, strict: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--url') args.baseUrl = argv[++i] ?? args.baseUrl;
    else if (arg === '--timeout') args.timeout = Number(argv[++i] ?? args.timeout);
    else if (arg === '--strict') args.strict = true;
    else if (arg === '--help' || arg === '-h') { usage(); process.exit(0); }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isFinite(args.timeout) || args.timeout < 100) throw new Error('timeout must be at least 100ms');
  return args;
};

const stateFor = (status, error) => {
  if (status === undefined) return error ? 'unhealthy' : 'unknown';
  if (status >= 200 && status < 300) return 'healthy';
  if (status === 429 || status >= 500) return 'unhealthy';
  if (status >= 400) return 'degraded';
  return 'unknown';
};

const severity = { healthy: 0, degraded: 1, unknown: 2, unhealthy: 3 };
const recommendation = (name, state) => {
  if (state === 'healthy') return undefined;
  if (name === 'readiness') return 'Inspect dependency readiness and startup/runtime logs before changing network policy.';
  if (name === 'network') return 'Inspect DNS, transport, route/provider health and application-level reachability before switching paths.';
  if (name === 'platform') return 'Inspect the current route decision, recovery issues and dependency state; do not blindly retry or flap routes.';
  if (name === 'metrics') return 'Restore the local metrics exposition path; diagnostics remain usable without external telemetry collectors.';
  return `Investigate the ${name} diagnostic check and its structured details.`;
};

const fetchJson = async (baseUrl, path, timeout) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const started = performance.now();
  try {
    const response = await fetch(new URL(path, baseUrl), { signal: controller.signal, headers: { accept: 'application/json' } });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : undefined; } catch { data = undefined; }
    return { state: stateFor(response.status), httpStatus: response.status, latencyMs: Math.round(performance.now() - started), data };
  } catch (error) {
    return { state: 'unhealthy', latencyMs: Math.round(performance.now() - started), details: { error: error instanceof Error ? error.name : String(error) } };
  } finally {
    clearTimeout(timer);
  }
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = new URL(args.baseUrl).toString();
  const endpoints = [
    ['live', '/api/v1/live'],
    ['readiness', '/api/v1/ready'],
    ['network', '/api/v1/health/network'],
    ['platform', '/api/v1/platform/status'],
    ['metrics', '/api/v1/metrics'],
  ];
  const checks = [];
  let platformStatus;
  for (const [name, path] of endpoints) {
    const result = await fetchJson(baseUrl, path, args.timeout);
    const details = result.data?.data && typeof result.data.data === 'object' ? result.data.data : undefined;
    checks.push({ name, state: result.state, ...(result.latencyMs !== undefined ? { latencyMs: result.latencyMs } : {}), ...(result.httpStatus !== undefined ? { httpStatus: result.httpStatus } : {}), ...(details ? { details } : {}), ...(result.details ? { details: result.details } : {}) });
    if (name === 'platform' && details) platformStatus = details;
  }
  const overall = checks.reduce((current, check) => severity[check.state] > severity[current] ? check.state : current, 'healthy');
  const recommendations = [...new Set(checks.map((check) => recommendation(check.name, check.state)).filter(Boolean))];
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: baseUrl,
    overall,
    checks,
    dependencies: platformStatus?.dependencies ?? {},
    decision: platformStatus?.decision ?? {},
    observability: {
      metrics: checks.find((check) => check.name === 'metrics')?.state === 'healthy' ? 'available' : 'unavailable',
      telemetry: platformStatus?.observability?.telemetry,
    },
    recommendations,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (args.strict && overall !== 'healthy') process.exitCode = 2;
  else if (overall === 'unhealthy') process.exitCode = 1;
};

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 3; });
