import http from 'node:http';
import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT ?? 8080);
const METRICS_PORT = Number(process.env.METRICS_PORT ?? 9464);
const TEMPO_URL = process.env.TEMPO_URL ?? 'http://tempo:4318/v1/traces';
const SCENARIO_INTERVAL_MS = Number(process.env.SCENARIO_INTERVAL_MS ?? 15000);
const PACKAGE_AUDIT_INTERVAL_MS = Number(process.env.PACKAGE_AUDIT_INTERVAL_MS ?? 60000);
const ROOT = join(process.cwd());
const PACKAGE_REPORT = process.env.IRP_PACKAGE_INTEGRATION_OUTPUT ?? join(ROOT, '.runtime-package-integration.json');

const counters = new Map();
const gauges = new Map();
const clients = new Set();
let lastReport = null;
let packageReport = null;
let appListening = false;
let metricsListening = false;
let scenarioRunning = false;
let packageAuditRunning = false;
let scenarioTimer = null;
let packageAuditTimer = null;
let shuttingDown = false;
let lastPackageAuditAt = 0;

function inc(name, labels = {}, value = 1) { const key = `${name}|${JSON.stringify(labels)}`; counters.set(key, { name, labels, value: (counters.get(key)?.value ?? 0) + value }); }
function setGauge(name, labels = {}, value = 0) { const key = `${name}|${JSON.stringify(labels)}`; gauges.set(key, { name, labels, value }); }
function escapeLabel(value) { return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n'); }
function renderMetric(entry) { const labels = Object.entries(entry.labels).map(([k, v]) => `${k}="${escapeLabel(v)}"`).join(','); return `${entry.name}${labels ? `{${labels}}` : ''} ${entry.value}`; }
function metricsText() { const lines = ['# HELP irp_runtime_lab_up Runtime lab process health.', '# TYPE irp_runtime_lab_up gauge', `irp_runtime_lab_up ${shuttingDown ? 0 : 1}`]; for (const entry of counters.values()) lines.push(renderMetric(entry)); for (const entry of gauges.values()) lines.push(renderMetric(entry)); return `${lines.join('\n')}\n`; }
function ids() { return { traceId: crypto.randomBytes(16).toString('hex'), spanId: crypto.randomBytes(8).toString('hex') }; }
function attr(key, value) { return { key, value: typeof value === 'number' ? { doubleValue: value } : { stringValue: String(value) } }; }
async function sendTrace(spans) { try { await fetch(TEMPO_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ resourceSpans: [{ resource: { attributes: [attr('service.name', 'irp-runtime-lab'), attr('service.version', '0.1.0')] }, scopeSpans: [{ scope: { name: 'irp-runtime-lab', version: '1.0.0' }, spans }] }] }), signal: AbortSignal.timeout(5000) }); } catch { inc('irp_observability_export_failures_total', { signal: 'traces' }); } }
function publish(event, data) { const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; for (const res of clients) res.write(payload); }
function readPackageReport() { try { return existsSync(PACKAGE_REPORT) ? JSON.parse(readFileSync(PACKAGE_REPORT, 'utf8')) : packageReport; } catch (error) { return { schemaVersion: 1, overall: 'unhealthy', totals: {}, packages: [], error: error instanceof Error ? error.message : String(error) }; } }
function runPackageAudit() {
  if (packageAuditRunning || shuttingDown) return;
  packageAuditRunning = true;
  publish('package-audit', { state: 'running', generatedAt: new Date().toISOString() });
  const child = spawn(process.execPath, ['tools/runtime-lab/package-integration.mjs'], { cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('close', (code) => {
    packageAuditRunning = false;
    lastPackageAuditAt = Date.now();
    packageReport = readPackageReport() ?? { schemaVersion: 1, overall: code === 0 ? 'healthy' : 'unhealthy', totals: {}, packages: [] };
    packageReport.generatedAt = packageReport.generatedAt ?? new Date().toISOString();
    packageReport.runner = { exitCode: code, stderr: stderr.trim() || undefined };
    const totals = packageReport.totals ?? {};
    setGauge('irp_packages_total', {}, Number(totals.packages ?? 0));
    setGauge('irp_packages_executed', {}, Number(totals.executed ?? 0));
    setGauge('irp_package_integrations_total', {}, Number(totals.integrations ?? 0));
    setGauge('irp_package_integrations_success', {}, Number(totals.integrated ?? 0));
    inc('irp_package_audits_total');
    if (packageReport.overall !== 'healthy') inc('irp_package_audits_failed_total');
    publish('package-audit', packageReport);
  });
}

async function executeScenario() {
  if (scenarioRunning || shuttingDown) { if (scenarioRunning) inc('irp_runtime_cycles_skipped_total', { reason: 'already_running' }); return; }
  scenarioRunning = true; setGauge('irp_runtime_scenario_running', {}, 1);
  if (!packageReport || Date.now() - lastPackageAuditAt >= PACKAGE_AUDIT_INTERVAL_MS) runPackageAudit();
  const started = process.hrtime.bigint(); const { traceId, spanId: rootSpanId } = ids(); const spans = []; const now = BigInt(Date.now()) * 1_000_000n;
  const span = (name, parentSpanId, startOffsetMs, durationMs, attributes = {}, status = 1) => { const spanId = ids().spanId; const start = now + BigInt(Math.round(startOffsetMs * 1_000_000)); const end = start + BigInt(Math.round(durationMs * 1_000_000)); spans.push({ traceId, spanId, ...(parentSpanId ? { parentSpanId } : {}), name, startTimeUnixNano: String(start), endTimeUnixNano: String(end), kind: 1, attributes: Object.entries(attributes).map(([k, v]) => attr(k, v)), status: { code: status } }); return spanId; };
  const root = { traceId, spanId: rootSpanId, name: 'irp.runtime.cycle', startTimeUnixNano: String(now), endTimeUnixNano: String(now + 1_000_000n), kind: 1, attributes: [attr('scenario', 'gateway-selection-and-runtime-validation')], status: { code: 1 } }; spans.push(root);
  try {
    const registrySpan = span('gateway-registry.select', rootSpanId, 1, 2, { 'irp.source': 'runtime-lab', 'irp.target': '@irp/gateway-registry' });
    inc('irp_package_calls_total', { source: 'runtime-lab', target: 'gateway-registry', operation: 'select' });
    const { selectGateway } = await import('../../packages/gateway-registry/dist/selection.js');
    const nowDate = new Date();
    const gateway = (id, region) => ({ id, name: id, region, countryCode: 'IR', providerId: 'lab-provider', endpoint: { host: '127.0.0.1', port: 443, family: 'ipv4' }, ownership: { ownerId: 'runtime-lab', managedBy: 'local' }, capabilities: { tunnelProtocols: ['wireguard'], addressFamilies: ['ipv4'], transports: ['tcp'], features: [] }, lifecycle: 'active', trust: 'trusted', tags: ['lab'], createdAt: nowDate.toISOString(), updatedAt: nowDate.toISOString() });
    const health = new Map([['gw-a', { gatewayId: 'gw-a', status: 'healthy', score: 88, latencyMs: 42, packetLossPercent: 1, checkedAt: nowDate.toISOString() }], ['gw-b', { gatewayId: 'gw-b', status: 'healthy', score: 72, latencyMs: 85, packetLossPercent: 3, checkedAt: nowDate.toISOString() }]]);
    const selection = selectGateway({ gateways: [gateway('gw-a', 'tehran'), gateway('gw-b', 'qazvin')], health });
    inc('irp_gateway_selections_total'); inc('irp_gateway_selection_success_total', { gateway: selection.selected?.gateway.id ?? 'none' }); setGauge('irp_gateway_selected_score', {}, selection.selected?.score ?? 0);
    span('gateway-registry.evaluate', registrySpan, 0.1, 0.8, { 'irp.gateway.selected': selection.selected?.gateway.id ?? 'none', 'irp.gateway.score': selection.selected?.score ?? 0 });
    const runtimeSpan = span('resilience-runtime.validation', rootSpanId, 4, 8, { 'irp.source': 'runtime-lab', 'irp.target': '@irp/resilience-runtime' });
    inc('irp_package_calls_total', { source: 'runtime-lab', target: 'resilience-runtime', operation: 'phase40-validation' });
    const { runPhase40Validation } = await import('../../packages/resilience-runtime/dist/e2e-validation.js');
    const report = await runPhase40Validation(); const passed = report.status === 'passed'; inc('irp_runtime_cycles_total'); if (!passed) inc('irp_runtime_cycles_failed_total'); inc('irp_runtime_scenarios_total', { status: report.status }); setGauge('irp_runtime_acceptance_criteria', {}, Object.values(report.acceptance).filter(Boolean).length); span('resilience-runtime.scenarios', runtimeSpan, 0.2, 6, { 'irp.scenarios': report.scenarios.length, 'irp.status': report.status }, passed ? 1 : 2);
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6; setGauge('irp_runtime_cycle_duration_ms', {}, elapsedMs); root.endTimeUnixNano = String(now + BigInt(Math.round(elapsedMs * 1_000_000)));
    lastReport = { generatedAt: new Date().toISOString(), status: report.status, deterministic: report.deterministic, scenarios: report.scenarios, acceptance: report.acceptance, failedCriteria: report.failedCriteria, gatewaySelection: { selected: selection.selected?.gateway.id ?? null, score: selection.selected?.score ?? null, candidates: selection.candidates.map((c) => ({ id: c.gateway.id, eligible: c.eligible, score: c.score })) }, packageIntegration: packageReport, durationMs: elapsedMs, traceId };
    publish('runtime-cycle', lastReport);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error); const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6; inc('irp_runtime_cycles_failed_total'); root.status = { code: 2, message }; root.endTimeUnixNano = String(now + BigInt(Math.round(elapsedMs * 1_000_000))); lastReport = { generatedAt: new Date().toISOString(), status: 'failed', deterministic: true, scenarios: [], acceptance: {}, failedCriteria: ['runtime-cycle-exception'], error: message, packageIntegration: packageReport, traceId, durationMs: elapsedMs }; publish('runtime-cycle', lastReport);
  } finally { await sendTrace(spans); scenarioRunning = false; setGauge('irp_runtime_scenario_running', {}, 0); }
}
function scheduleScenario() { if (scenarioTimer) clearTimeout(scenarioTimer); if (shuttingDown) return; scenarioTimer = setTimeout(async () => { await executeScenario(); scheduleScenario(); }, SCENARIO_INTERVAL_MS); }
function schedulePackageAudit() { if (packageAuditTimer) clearTimeout(packageAuditTimer); if (shuttingDown) return; packageAuditTimer = setTimeout(() => { runPackageAudit(); schedulePackageAudit(); }, PACKAGE_AUDIT_INTERVAL_MS); }
process.on('uncaughtException', (error) => { console.error(JSON.stringify({ level: 'fatal', event: 'uncaught_exception', error: error instanceof Error ? error.stack ?? error.message : String(error) })); setGauge('irp_runtime_process_errors', { type: 'uncaughtException' }, 1); });
process.on('unhandledRejection', (reason) => { console.error(JSON.stringify({ level: 'fatal', event: 'unhandled_rejection', error: reason instanceof Error ? reason.stack ?? reason.message : String(reason) })); setGauge('irp_runtime_process_errors', { type: 'unhandledRejection' }, 1); });

const app = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ status: 'ok', service: 'irp-runtime-lab', shuttingDown })); return; }
  if (url.pathname === '/ready') { const scenarioCompleted = lastReport !== null; const scenarioPassed = lastReport?.status === 'passed'; const packageReady = packageReport?.overall === 'healthy'; const ready = !shuttingDown && appListening && metricsListening && scenarioPassed && packageReady && !scenarioRunning; res.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ status: ready ? 'ready' : scenarioCompleted ? 'failed' : 'starting', appListening, metricsListening, scenarioCompleted, scenarioRunning, scenarioStatus: lastReport?.status ?? null, packageStatus: packageReport?.overall ?? 'starting', packageAuditRunning, failedCriteria: lastReport?.failedCriteria ?? [], error: lastReport?.error ?? null, traceId: lastReport?.traceId ?? null })); return; }
  if (url.pathname === '/report') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify({ ...(lastReport ?? { status: 'starting' }), packageIntegration: packageReport }, null, 2)); return; }
  if (url.pathname === '/package-integration') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(packageReport ?? readPackageReport() ?? { status: 'starting' }, null, 2)); return; }
  if (url.pathname === '/events') { res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'access-control-allow-origin': '*' }); res.write(`event: snapshot\ndata: ${JSON.stringify({ report: lastReport, packageIntegration: packageReport })}\n\n`); clients.add(res); req.on('close', () => clients.delete(res)); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(`<!doctype html><html><head><meta charset="utf-8"><title>IRP Runtime Lab</title><style>body{font-family:system-ui;margin:40px;max-width:1100px}pre{background:#111;color:#eee;padding:20px;border-radius:8px;overflow:auto}a{margin-right:20px}</style></head><body><h1>IRP Runtime Lab</h1><p>Docker runtime verification, package execution and integration smoke tests.</p><p><a href="/report">JSON report</a><a href="/package-integration">Package integration</a><a href="/health">Health</a><a href="/ready">Readiness</a></p><pre id="out">${JSON.stringify(lastReport ?? { status: 'starting' }, null, 2)}</pre><script>const out=document.querySelector('#out');const es=new EventSource('/events');es.onmessage=()=>{};es.addEventListener('snapshot',e=>out.textContent=JSON.stringify(JSON.parse(e.data),null,2));es.addEventListener('runtime-cycle',e=>out.textContent=JSON.stringify(JSON.parse(e.data),null,2));es.addEventListener('package-audit',e=>out.textContent=JSON.stringify(JSON.parse(e.data),null,2));</script></body></html>`);
});
const metrics = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' }); res.end(metricsText()); });
function listen(server, port, name) { return new Promise((resolve, reject) => { const onError = (error) => { server.off('listening', onListening); reject(error); }; const onListening = () => { server.off('error', onError); console.log(JSON.stringify({ level: 'info', event: `${name}_started`, port })); resolve(); }; server.once('error', onError); server.once('listening', onListening); }); }
function closeServer(server, name) { return new Promise((resolve) => { if (!server.listening) { resolve(); return; } server.close(() => { console.log(JSON.stringify({ level: 'info', event: `${name}_shutdown_complete` })); resolve(); }); }); }
async function shutdown(signal) { if (shuttingDown) return; shuttingDown = true; if (scenarioTimer) clearTimeout(scenarioTimer); if (packageAuditTimer) clearTimeout(packageAuditTimer); for (const res of clients) res.end(); clients.clear(); await Promise.all([closeServer(app, 'lab'), closeServer(metrics, 'metrics')]); appListening = false; metricsListening = false; console.log(JSON.stringify({ level: 'info', event: 'shutdown_requested', signal })); }
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { void shutdown(signal).finally(() => process.exit(0)); });
await Promise.all([listen(app, PORT, 'lab'), listen(metrics, METRICS_PORT, 'metrics')]); appListening = true; metricsListening = true; runPackageAudit(); await executeScenario(); scheduleScenario(); schedulePackageAudit();
