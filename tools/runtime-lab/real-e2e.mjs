#!/usr/bin/env node
// Real end-to-end smoke: start processes and validate health, platform/status and Prometheus metrics.

import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const apiPort = Number(process.env.IRP_E2E_API_PORT ?? 18080);
const timeoutMs = Number(process.env.IRP_PACKAGE_INTEGRATION_TIMEOUT_MS ?? 30000);

function startProcess(cmd, args = [], env = {}) {
  const child = spawn(cmd, args, {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '',
    stderr = '';
  child.stdout.on('data', (d) => {
    stdout += d;
  });
  child.stderr.on('data', (d) => {
    stderr += d;
  });
  return { child, getOutput: () => ({ stdout: stdout.trim(), stderr: stderr.trim() }) };
}

async function waitForHttp(url, timeout = timeoutMs, interval = 250) {
  const deadline = Date.now() + timeout;
  let lastErr = 'not attempted';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
      const body = await res.text();
      return { ok: true, status: res.status, body };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    await delay(interval);
  }
  return { ok: false, error: lastErr };
}

function metricsHasAny(metricsText, names) {
  if (!metricsText) return false;
  const regex = new RegExp(names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'));
  return regex.test(metricsText);
}

async function run() {
  const started = Date.now();
  console.log('Starting end-to-end smoke (process-mode)');

  // Start API using pnpm start filter; assumes workspace is built and pnpm is available
  const api = startProcess('pnpm', ['--silent', '--filter', '@irp/api', 'start'], {
    NODE_ENV: 'test',
    API_HOST: '127.0.0.1',
    API_PORT: String(apiPort),
    LOG_LEVEL: 'error',
    TELEMETRY_ENABLED: 'true', // ensure metrics exposition
  });

  try {
    const base = `http://127.0.0.1:${apiPort}`;
    console.log('Waiting for /api/v1/ready ...');
    const ready = await waitForHttp(`${base}/api/v1/ready`, timeoutMs * 2, 1000);
    if (!ready.ok) {
      console.error('API ready check failed:', ready.error);
      console.error('API stdout:', api.getOutput().stdout);
      console.error('API stderr:', api.getOutput().stderr);
      process.exitCode = 2;
      return;
    }

    console.log('/ready OK, validating /api/v1/platform/status');
    const ps = await waitForHttp(`${base}/api/v1/platform/status`);
    if (!ps.ok) throw new Error(`platform/status failed: ${ps.error}`);
    let statusBody;
    try {
      statusBody = JSON.parse(ps.body);
    } catch (e) {
      throw new Error('platform/status returned non-JSON');
    }
    if (statusBody?.success !== true || statusBody?.data?.dependencies?.database !== 'healthy') {
      throw new Error(
        `database dependency not healthy: ${JSON.stringify(statusBody?.data?.dependencies)}`,
      );
    }

    console.log('Checking /api/v1/version');
    const v = await waitForHttp(`${base}/api/v1/version`);
    if (!v.ok) throw new Error(`version probe failed: ${v.error}`);
    const parsed = JSON.parse(v.body);
    if (parsed?.success !== true || !parsed?.data?.version)
      throw new Error('version response contract failed');

    console.log('Checking /api/v1/metrics (Prometheus)');
    const m = await waitForHttp(`${base}/api/v1/metrics`);
    if (!m.ok) throw new Error(`metrics probe failed: ${m.error}`);
    const metricsText = m.body ?? '';
    const expected = [
      'irp_http_requests_total',
      'irp_http_request_duration_seconds',
      'irp_http_active_requests',
    ];
    if (!metricsHasAny(metricsText, expected)) {
      const snippet = metricsText.slice(0, 4000);
      throw new Error(
        `metrics contract failed: expected one of ${expected.join(', ')}; got snippet: ${JSON.stringify(snippet)}`,
      );
    }

    console.log('End-to-end smoke: SUCCESS', `took ${Date.now() - started}ms`);
    process.exitCode = 0;
  } catch (err) {
    console.error('End-to-end smoke: FAILURE', err instanceof Error ? err.message : String(err));
    console.error('API stdout:', api.getOutput().stdout);
    console.error('API stderr:', api.getOutput().stderr);
    process.exitCode = 1;
  } finally {
    try {
      api.child.kill('SIGTERM');
    } catch {}
    await new Promise((r) => api.child.once('close', r));
  }
}

run();
