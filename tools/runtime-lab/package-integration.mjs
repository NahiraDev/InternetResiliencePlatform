#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(new URL('../..', import.meta.url).pathname);
const workspaceRoots = [join(root, 'packages'), join(root, 'apps')];
const timeoutMs = Number(process.env.IRP_PACKAGE_INTEGRATION_TIMEOUT_MS ?? 15000);
const outputFile = process.env.IRP_PACKAGE_INTEGRATION_OUTPUT ?? join(root, '.runtime-package-integration.json');

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
      return {
        name: manifest.name ?? entry.name,
        directory: relative(root, dir),
        manifest,
        entryPath,
        workspaceDeps,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function runNode(code, args = []) {
  return new Promise((resolveResult) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code, ...args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); resolveResult({ ok: false, timedOut: true, stdout, stderr: `timeout after ${timeoutMs}ms` }); }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => { clearTimeout(timer); resolveResult({ ok: code === 0, exitCode: code, stdout: stdout.trim(), stderr: stderr.trim() }); });
    child.on('error', (error) => { clearTimeout(timer); resolveResult({ ok: false, error: error instanceof Error ? error.message : String(error), stdout, stderr }); });
  });
}

const catalog = packageCatalog();
const byName = new Map(catalog.map((pkg) => [pkg.name, pkg]));
const results = [];

for (const pkg of catalog) {
  const started = performance.now();
  if (!pkg.entryPath || !existsSync(pkg.entryPath)) {
    results.push({ package: pkg.name, directory: pkg.directory, state: 'unavailable', mode: 'manifest-only', latencyMs: Math.round(performance.now() - started), reason: pkg.entryPath ? `entry not found at ${pkg.entryPath}` : 'no entry point defined' });
    continue;
  }
  const load = await runNode('await import(process.argv[1])', [new URL(`file://${pkg.entryPath}`).href]);
  const integrationTargets = pkg.workspaceDeps.filter((name) => byName.has(name));
  const integrations = [];
  for (const targetName of integrationTargets) {
    const target = byName.get(targetName);
    if (!target?.entryPath || !existsSync(target.entryPath)) {
      integrations.push({ target: targetName, state: 'unavailable', reason: 'dependency entry not built' });
      continue;
    }
    const check = await runNode('await import(process.argv[1]); await import(process.argv[2])', [new URL(`file://${pkg.entryPath}`).href, new URL(`file://${target.entryPath}`).href]);
    integrations.push({ target: targetName, state: check.ok ? 'integrated' : 'failed', exitCode: check.exitCode, error: check.stderr || undefined });
  }
  results.push({ package: pkg.name, directory: pkg.directory, state: load.ok ? (integrations.some((item) => item.state === 'failed') ? 'degraded' : 'executed') : 'failed', mode: 'runtime-import', latencyMs: Math.round(performance.now() - started), exitCode: load.exitCode, error: load.stderr || load.error || undefined, integrations });
}

const runtime = results.filter((item) => item.mode === 'runtime-import');
const report = {
  schemaVersion: 1,
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
      if (pkg.state !== 'executed') {
        console.error(`\n❌ Package: ${pkg.package}`);
        console.error(`   Directory: ${pkg.directory}`);
        console.error(`   State: ${pkg.state}`);
        console.error(`   Mode: ${pkg.mode}`);
        if (pkg.reason) console.error(`   Reason: ${pkg.reason}`);
        if (pkg.error) console.error(`   Error: ${pkg.error}`);
        if (pkg.integrations && pkg.integrations.length > 0) {
          const failedIntegrations = pkg.integrations.filter((i) => i.state !== 'integrated');
          if (failedIntegrations.length > 0) {
            console.error(`   Failed Integrations:`);
            for (const integration of failedIntegrations) {
              console.error(`     - ${integration.target}: ${integration.state}`);
              if (integration.reason) console.error(`       Reason: ${integration.reason}`);
              if (integration.error) console.error(`       Error: ${integration.error}`);
            }
          }
        }
      }
    }
    console.error('\n=== END DIAGNOSTICS ===\n');
  }
  process.exitCode = report.overall !== 'healthy' ? 2 : 0;
}
