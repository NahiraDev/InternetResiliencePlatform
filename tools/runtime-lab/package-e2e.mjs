#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(new URL('../..', import.meta.url).pathname);
const workspaceRoots = [join(root, 'packages'), join(root, 'apps')];
const timeoutMs = Number(process.env.IRP_PACKAGE_INTEGRATION_TIMEOUT_MS ?? 30000);
const outputFile = process.env.IRP_PACKAGE_INTEGRATION_OUTPUT ?? join(root, '.runtime-package-integration.json');
const apiPort = Number(process.env.IRP_E2E_API_PORT ?? 18080);

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

function entryFromManifest(manifest) {
  const exports = manifest.exports;
  if (typeof exports === 'string') return exports;
  if (exports && typeof exports === 'object') {
    const dot = exports['.'];
    if (typeof dot === 'string') return dot;
    if (dot && typeof dot === 'object') return dot.import ?? dot.require ?? dot.default ?? dot.node;
  }
  return manifest.module ?? manifest.main ?? './dist/index.js';
}

function packageCatalog() {
  return workspaceRoots
    .flatMap((workspaceRoot) => {
      if (!existsSync(workspaceRoot)) return [];
      return readdirSync(workspaceRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({ workspaceRoot, entry }));
    })
    .map(({ workspaceRoot, entry }) => {
      const dir = join(workspaceRoot, entry.name);
      const manifest = readJson(join(dir, 'package.json'));
      const rawEntry = entryFromManifest(manifest);
      const entryPath = rawEntry ? resolve(dir, rawEntry.replace(/^\.\//, '')) : null;
      const workspaceDeps = Object.entries({
        ...(manifest.dependencies ?? {}),
        ...(manifest.optionalDependencies ?? {}),
        ...(manifest.peerDependencies ?? {}),
      })
        .filter(([, version]) => String(version).startsWith('workspace:'))
        .map(([name]) => name);
      return { name: manifest.name ?? entry.name, directory: relative(root, dir), manifest, entryPath, workspaceDeps };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function runNode(code, args = [], env = {}) {
  return new Promise((resolveResult) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code, ...args], {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolveResult({ ok: false, timedOut: true, stdout, stderr: `timeout after ${timeoutMs}ms` });
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => { clearTimeout(timer); resolveResult({ ok: code === 0, exitCode: code, stdout: stdout.trim(), stderr: stderr.trim() }); });
    child.on('error', (error) => { clearTimeout(timer); resolveResult({ ok: false, error: error instanceof Error ? error.message : String(error), stdout, stderr }); });
  });
}

function startProcess(entryPath, env = {}) {
  const child = spawn(process.execPath, [entryPath], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  return { child, getOutput: () => ({ stdout: stdout.trim(), stderr: stderr.trim() }) };
}

async function waitForHttp(url, expectedStatuses = [200]) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'not attempted';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
      const body = await response.text();
      if (expectedStatuses.includes(response.status)) return { ok: true, status: response.status, body };
      lastError = `HTTP ${response.status}: ${body.slice(0, 500)}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolveResult) => setTimeout(resolveResult, 250));
  }
  return { ok: false, error: lastError };
}

async function runApiE2E(pkg) {
  const started = performance.now();
  if (!pkg.entryPath || !existsSync(pkg.entryPath)) return { state: 'failed', mode: 'http-e2e', error: `entry not found at ${pkg.entryPath}` };
  const runtime = startProcess(pkg.entryPath, {
    NODE_ENV: 'test',
    API_HOST: '127.0.0.1',
    API_PORT: String(apiPort),
    JWT_SECRET: 'irp-e2e-test-secret-01234567890123456789',
    LOG_LEVEL: 'error',
    TELEMETRY_ENABLED: 'false',
  });
  try {
    const base = `http://127.0.0.1:${apiPort}`;
    const health = await waitForHttp(`${base}/api/v1/health`);
    if (!health.ok) throw new Error(`health probe failed: ${health.error}`);
    const live = await waitForHttp(`${base}/api/v1/live`);
    if (!live.ok) throw new Error(`live probe failed: ${live.error}`);
    const version = await waitForHttp(`${base}/api/v1/version`);
    if (!version.ok) throw new Error(`version probe failed: ${version.error}`);
    const metrics = await waitForHttp(`${base}/api/v1/metrics`);
    if (!metrics.ok) throw new Error(`metrics probe failed: ${metrics.error}`);
    const parsedVersion = JSON.parse(version.body);
    if (parsedVersion?.success !== true || !parsedVersion?.data?.version) throw new Error('version response contract failed');
    if (!metrics.body.includes('http_request_total')) throw new Error('metrics response contract failed');
    return {
      package: pkg.name,
      directory: pkg.directory,
      state: 'executed',
      mode: 'http-e2e',
      latencyMs: Math.round(performance.now() - started),
      checks: ['process-start', 'GET /api/v1/health', 'GET /api/v1/live', 'GET /api/v1/version', 'GET /api/v1/metrics'],
    };
  } catch (error) {
    return { package: pkg.name, directory: pkg.directory, state: 'failed', mode: 'http-e2e', latencyMs: Math.round(performance.now() - started), error: error instanceof Error ? error.message : String(error), output: runtime.getOutput() };
  } finally {
    runtime.child.kill('SIGTERM');
    await new Promise((resolveResult) => runtime.child.once('close', resolveResult));
  }
}

async function runDaemonE2E(pkg) {
  const started = performance.now();
  if (!pkg.entryPath || !existsSync(pkg.entryPath)) return { package: pkg.name, directory: pkg.directory, state: 'failed', mode: 'process-e2e', error: `entry not found at ${pkg.entryPath}` };
  const runtime = startProcess(pkg.entryPath, { NODE_ENV: 'test', LOG_LEVEL: 'error' });
  try {
    const result = await new Promise((resolveResult) => {
      let settled = false;
      const settle = (value) => { if (!settled) { settled = true; resolveResult(value); } };
      const timer = setTimeout(() => settle({ ok: true }), Math.min(timeoutMs, 5000));
      runtime.child.once('exit', (code, signal) => { clearTimeout(timer); settle({ ok: false, code, signal, output: runtime.getOutput() }); });
      runtime.child.once('error', (error) => { clearTimeout(timer); settle({ ok: false, error: error.message, output: runtime.getOutput() }); });
    });
    if (!result.ok) throw new Error(`daemon exited during startup: ${JSON.stringify(result)}`);
    return { package: pkg.name, directory: pkg.directory, state: 'executed', mode: 'process-e2e', latencyMs: Math.round(performance.now() - started), checks: ['process-start', 'process-stays-running'] };
  } catch (error) {
    return { package: pkg.name, directory: pkg.directory, state: 'failed', mode: 'process-e2e', latencyMs: Math.round(performance.now() - started), error: error instanceof Error ? error.message : String(error), output: runtime.getOutput() };
  } finally {
    runtime.child.kill('SIGTERM');
    await new Promise((resolveResult) => runtime.child.once('close', resolveResult));
  }
}

async function runLibraryImport(pkg, byName) {
  const started = performance.now();
  if (!pkg.entryPath || !existsSync(pkg.entryPath)) return { package: pkg.name, directory: pkg.directory, state: 'unavailable', mode: 'manifest-only', latencyMs: Math.round(performance.now() - started), reason: pkg.entryPath ? `entry not found at ${pkg.entryPath}` : 'no entry point defined' };
  const load = await runNode('await import(process.argv[1])', [new URL(`file://${pkg.entryPath}`).href]);
  const integrations = [];
  for (const targetName of pkg.workspaceDeps.filter((name) => byName.has(name))) {
    const target = byName.get(targetName);
    if (!target?.entryPath || !existsSync(target.entryPath)) { integrations.push({ target: targetName, state: 'unavailable', reason: 'dependency entry not built' }); continue; }
    const check = await runNode('await import(process.argv[1]); await import(process.argv[2])', [new URL(`file://${pkg.entryPath}`).href, new URL(`file://${target.entryPath}`).href]);
    integrations.push({ target: targetName, state: check.ok ? 'integrated' : 'failed', exitCode: check.exitCode, error: check.stderr || undefined });
  }
  return { package: pkg.name, directory: pkg.directory, state: load.ok ? (integrations.some((item) => item.state === 'failed') ? 'degraded' : 'executed') : 'failed', mode: 'runtime-import', latencyMs: Math.round(performance.now() - started), exitCode: load.exitCode, error: load.stderr || load.error || undefined, integrations };
}

const catalog = packageCatalog();
const byName = new Map(catalog.map((pkg) => [pkg.name, pkg]));
const results = [];

for (const pkg of catalog) {
  if (pkg.name === '@irp/api') results.push(await runApiE2E(pkg));
  else if (pkg.name === '@irp/daemon') results.push(await runDaemonE2E(pkg));
  else results.push(await runLibraryImport(pkg, byName));
}

const runtime = results.filter((item) => item.mode !== 'manifest-only');
const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  overall: runtime.some((item) => item.state === 'failed') ? 'unhealthy' : runtime.some((item) => item.state === 'degraded') ? 'degraded' : 'healthy',
  totals: { packages: results.length, runtime: runtime.length, executed: results.filter((item) => item.state === 'executed').length, failed: results.filter((item) => item.state === 'failed').length, degraded: results.filter((item) => item.state === 'degraded').length },
  packages: results,
};
writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

if (process.argv.includes('--strict')) {
  if (report.overall !== 'healthy') {
    console.error('\n=== PACKAGE INTEGRATION DIAGNOSTICS ===');
    console.error(`Overall Status: ${report.overall.toUpperCase()}`);
    console.error(`Totals: ${report.totals.packages} packages, ${report.totals.runtime} runtime, ${report.totals.executed} executed, ${report.totals.failed} failed, ${report.totals.degraded} degraded\n`);
    for (const pkg of report.packages) {
      if (pkg.state !== 'executed') console.error(`\n❌ Package: ${pkg.package}\n   Directory: ${pkg.directory}\n   State: ${pkg.state}\n   Mode: ${pkg.mode}\n   ${pkg.reason ? `Reason: ${pkg.reason}` : ''}${pkg.error ? `Error: ${pkg.error}` : ''}`);
    }
    console.error('\n=== END DIAGNOSTICS ===\n');
  }
  process.exitCode = report.overall !== 'healthy' ? 2 : 0;
}
