import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT ?? 8080);
const METRICS_PORT = Number(process.env.METRICS_PORT ?? 9464);
const TEMPO_URL = process.env.TEMPO_URL ?? 'http://tempo:4318/v1/traces';

const counters = new Map();
const gauges = new Map();
let lastReport = null;
let appListening = false;
let metricsListening = false;

function inc(name, labels = {}, value = 1) {
  const key = `${name}|${JSON.stringify(labels)}`;
  counters.set(key, { name, labels, value: (counters.get(key)?.value ?? 0) + value });
}
function setGauge(name, labels = {}, value = 0) {
  const key = `${name}|${JSON.stringify(labels)}`;
  gauges.set(key, { name, labels, value });
}
function escapeLabel(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');
}
function renderMetric(entry) {
  const labels = Object.entries(entry.labels).map(([k, v]) => `${k}="${escapeLabel(v)}"`).join(',');
  return `${entry.name}${labels ? `{${labels}}` : ''} ${entry.value}`;
}
function metricsText() {
  const lines = [
    '# HELP irp_runtime_lab_up Runtime lab process health.',
    '# TYPE irp_runtime_lab_up gauge',
    'irp_runtime_lab_up 1',
  ];
  for (const entry of counters.values()) lines.push(renderMetric(entry));
  for (const entry of gauges.values()) lines.push(renderMetric(entry));
  return `${lines.join('\n')}\n`;
}

function ids() {
  return { traceId: crypto.randomBytes(16).toString('hex'), spanId: crypto.randomBytes(8).toString('hex') };
}
function attr(key, value) {
  const v = typeof value === 'number' ? { doubleValue: value } : { stringValue: String(value) };
  return { key, value: v };
}
async function sendTrace(spans) {
  try {
    await fetch(TEMPO_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        resourceSpans: [{
          resource: { attributes: [attr('service.name', 'irp-runtime-lab'), attr('service.version', '0.1.0')] },
          scopeSpans: [{ scope: { name: 'irp-runtime-lab', version: '1.0.0' }, spans }],
        }],
      }),
    });
  } catch (error) {
    inc('irp_observability_export_failures_total', { signal: 'traces' });
    console.error(JSON.stringify({ level: 'error', event: 'trace_export_failed', error: String(error) }));
  }
}

async function executeScenario() {
  const started = process.hrtime.bigint();
  const { traceId, spanId: rootSpanId } = ids();
  const spans = [];
  const now = Date.now() * 1_000_000;
  const span = (name, parentSpanId, startOffsetMs, durationMs, attributes = {}, status = 1) => {
    const spanId = ids().spanId;
    const start = now + BigInt(Math.round(startOffsetMs * 1_000_000));
    const end = start + BigInt(Math.round(durationMs * 1_000_000));
    spans.push({ traceId, spanId, ...(parentSpanId ? { parentSpanId } : {}), name, startTimeUnixNano: String(start), endTimeUnixNano: String(end), kind: 1, attributes: Object.entries(attributes).map(([k, v]) => attr(k, v)), status: { code: status } });
    return spanId;
  };
  const root = { traceId, spanId: rootSpanId, name: 'irp.runtime.cycle', startTimeUnixNano: String(now), endTimeUnixNano: String(now + 1_000_000), kind: 1, attributes: [attr('scenario', 'gateway-selection-and-runtime-validation')], status: { code: 1 } };
  spans.push(root);

  try {
    const registrySpan = span('gateway-registry.select', rootSpanId, 1, 2, { 'irp.source': 'runtime-lab', 'irp.target': '@irp/gateway-registry' });
    inc('irp_package_calls_total', { source: 'runtime-lab', target: 'gateway-registry', operation: 'select' });
    const { selectGateway } = await import('../../packages/gateway-registry/dist/selection.js');
    const nowDate = new Date();
    const gateway = (id, region) => ({ id, name: id, region, countryCode: 'IR', providerId: 'lab-provider', endpoint: { host: '127.0.0.1', port: 443, family: 'ipv4' }, ownership: { ownerId: 'runtime-lab', managedBy: 'local' }, capabilities: { tunnelProtocols: ['wireguard'], addressFamilies: ['ipv4'], transports: ['tcp'], features: [] }, lifecycle: 'active', trust: 'trusted', tags: ['lab'], createdAt: nowDate.toISOString(), updatedAt: nowDate.toISOString() });
    const health = new Map([
      ['gw-a', { gatewayId: 'gw-a', status: 'healthy', score: 88, latencyMs: 42, packetLossPercent: 1, checkedAt: nowDate.toISOString() }],
      ['gw-b', { gatewayId: 'gw-b', status: 'healthy', score: 72, latencyMs: 85, packetLossPercent: 3, checkedAt: nowDate.toISOString() }],
    ]);
    const selection = selectGateway({ gateways: [gateway('gw-a', 'tehran'), gateway('gw-b', 'qazvin')], health });
    inc('irp_gateway_selections_total');
    inc('irp_gateway_selection_success_total', { gateway: selection.selected?.gateway.id ?? 'none' });
    setGauge('irp_gateway_selected_score', {}, selection.selected?.score ?? 0);
    span('gateway-registry.evaluate', registrySpan, 0.1, 0.8, { 'irp.gateway.selected': selection.selected?.gateway.id ?? 'none', 'irp.gateway.score': selection.selected?.score ?? 0 });

    const runtimeSpan = span('resilience-runtime.validation', rootSpanId, 4, 8, { 'irp.source': 'runtime-lab', 'irp.target': '@irp/resilience-runtime' });
    inc('irp_package_calls_total', { source: 'runtime-lab', target: 'resilience-runtime', operation: 'phase40-validation' });
    const { runPhase40Validation } = await import('../../packages/resilience-runtime/dist/e2e-validation.js');
    const report = await runPhase40Validation();
    const passed = report.status === 'passed';
    inc('irp_runtime_cycles_total');
    if (!passed) inc('irp_runtime_cycles_failed_total');
    inc('irp_runtime_scenarios_total', { status: report.status });
    setGauge('irp_runtime_acceptance_criteria', {}, Object.values(report.acceptance).filter(Boolean).length);
    span('resilience-runtime.scenarios', runtimeSpan, 0.2, 6, { 'irp.scenarios': report.scenarios.length, 'irp.status': report.status }, passed ? 1 : 2);

    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    setGauge('irp_runtime_cycle_duration_ms', {}, elapsedMs);
    root.endTimeUnixNano = String(now + BigInt(Math.round(elapsedMs * 1_000_000)));
    lastReport = { generatedAt: new Date().toISOString(), status: report.status, deterministic: report.deterministic, scenarios: report.scenarios, acceptance: report.acceptance, failedCriteria: report.failedCriteria, gatewaySelection: { selected: selection.selected?.gateway.id ?? null, score: selection.selected?.score ?? null, candidates: selection.candidates.map((c) => ({ id: c.gateway.id, eligible: c.eligible, score: c.score })) }, durationMs: elapsedMs, traceId };
    console.log(JSON.stringify({ level: 'info', event: 'runtime_cycle', trace_id: traceId, status: report.status, gateway: selection.selected?.gateway.id, failed_criteria: report.failedCriteria, duration_ms: elapsedMs }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    inc('irp_runtime_cycles_failed_total');
    root.status = { code: 2, message };
    root.endTimeUnixNano = String(now + BigInt(Math.round(elapsedMs * 1_000_000)));
    lastReport = { generatedAt: new Date().toISOString(), status: 'failed', deterministic: true, scenarios: [], acceptance: {}, failedCriteria: ['runtime-cycle-exception'], error: message, traceId, durationMs: elapsedMs };
    console.error(JSON.stringify({ level: 'error', event: 'runtime_cycle_failed', trace_id: traceId, error: message }));
  } finally {
    await sendTrace(spans);
  }
}

const app = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'irp-runtime-lab' }));
    return;
  }
  if (url.pathname === '/ready') {
    const scenarioCompleted = lastReport !== null;
    const scenarioPassed = lastReport?.status === 'passed';
    const ready = appListening && metricsListening && scenarioPassed;
    res.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: ready ? 'ready' : scenarioCompleted ? 'failed' : 'starting', appListening, metricsListening, scenarioCompleted, scenarioStatus: lastReport?.status ?? null, failedCriteria: lastReport?.failedCriteria ?? [], error: lastReport?.error ?? null, traceId: lastReport?.traceId ?? null }));
    return;
  }
  if (url.pathname === '/report') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(lastReport ?? { status: 'starting' }, null, 2));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html><head><meta charset="utf-8"><title>IRP Runtime Lab</title><style>body{font-family:system-ui;margin:40px;max-width:1000px}pre{background:#111;color:#eee;padding:20px;border-radius:8px;overflow:auto}a{margin-right:20px}</style></head><body><h1>IRP Runtime Lab</h1><p>Runtime verification and package interaction environment.</p><p><a href="/report">JSON report</a><a href="/health">Health</a><a href="/ready">Readiness</a><a href="http://localhost:3001">Grafana</a></p><pre>${JSON.stringify(lastReport ?? { status: 'starting' }, null, 2)}</pre></body></html>`);
});

const metrics = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
  res.end(metricsText());
});

function listen(server, port, name) {
  return new Promise((resolve, reject) => {
    const onError = (error) => { server.off('listening', onListening); reject(error); };
    const onListening = () => { server.off('error', onError); console.log(JSON.stringify({ level: 'info', event: `${name}_started`, port })); resolve(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '0.0.0.0');
  });
}

await Promise.all([listen(app, PORT, 'lab'), listen(metrics, METRICS_PORT, 'metrics')]);
appListening = true;
metricsListening = true;
await executeScenario();
setInterval(() => void executeScenario(), Number(process.env.SCENARIO_INTERVAL_MS ?? 15000));
