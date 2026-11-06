#!/usr/bin/env node
/**
 * IRP Local Development Entry Point
 *
 * Starts the full IRP platform locally on the developer's Linux host:
 *
 * 1. Builds workspace dependencies
 * 2. Starts PostgreSQL via Docker Compose (compose.dev.yaml)
 * 3. Applies database migrations without resetting data
 * 4. Starts the IRP daemon directly on the Linux host (observes real host interfaces/routes/DNS)
 * 5. Starts the IRP API directly on the Linux host
 * 6. Serves the Web Control Center through the API
 * 7. Checks readiness of PostgreSQL, daemon, and API
 * 8. Prints the browser URL and service information
 * 9. Handles Ctrl+C and terminates only processes started by this command
 *
 * The daemon runs on the host (not inside Docker) so it can observe the
 * developer's actual host network interfaces, routes, DNS, gateways, and
 * capabilities. Docker is used only for PostgreSQL.
 *
 * Usage: pnpm dev:local
 */

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import os from 'node:os';

const REPO_ROOT = process.cwd();
const COMPOSE_FILE = join(REPO_ROOT, 'compose.dev.yaml');
const DAEMON_ENTRY = join(REPO_ROOT, 'apps/daemon/dist/index.js');
const API_ENTRY = join(REPO_ROOT, 'apps/api/dist/index.js');
const PRISMA_BIN = join(REPO_ROOT, 'node_modules/.bin/prisma');
const POSTGRES_PORT = process.env.POSTGRES_PORT || '5433';
const DATABASE_URL = `postgresql://irp:irp_dev_password@127.0.0.1:${POSTGRES_PORT}/irp`;
const API_PORT = 8080;
const API_BASE = `http://127.0.0.1:${API_PORT}`;
const STATE_DIR = join(os.homedir(), '.local', 'state', 'irp');
const CONTROL_SOCKET_PATH = join(STATE_DIR, 'irp.sock');

const startedProcesses = [];
let shuttingDown = false;

const log = (component, message) => {
  const ts = new Date().toISOString().slice(11, 19);
  console.error(`[${ts}] [${component}] ${message}`);
};

const ok = (message) => log('dev:local', '\x1b[32m\u2713\x1b[0m ' + message);
const info = (message) => log('dev:local', '\x1b[36m\u2192\x1b[0m ' + message);
const warn = (message) => log('dev:local', '\x1b[33m\u26A0\x1b[0m ' + message);
const err = (message) => log('dev:local', '\x1b[31m\u2717\x1b[0m ' + message);

const run = (cmd, args, opts = {}) => {
  const options = { stdio: 'inherit', ...opts };
  return spawnSync(cmd, args, options);
};

const runCapture = (cmd, args, opts = {}) => {
  return spawnSync(cmd, args, { stdio: 'pipe', env: opts.env, cwd: opts.cwd });
};

const waitForTcp = async (host, port, timeoutMs = 30000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const socket = connect({ host, port }, () => { socket.end(); resolve(); });
        socket.on('error', reject);
        socket.setTimeout(1000, () => { socket.destroy(); reject(new Error('timeout')); });
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error('Timed out waiting for ' + host + ':' + port);
};

const waitForHttp = async (url, timeoutMs = 60000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status >= 200 && res.status < 500) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Timed out waiting for ' + url);
};

const waitForSocket = async (socketPath, timeoutMs = 30000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const socket = connect(socketPath, () => { socket.end(); resolve(); });
        socket.on('error', reject);
        socket.setTimeout(1000, () => { socket.destroy(); reject(new Error('timeout')); });
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error('Timed out waiting for socket ' + socketPath);
};

const stopProcess = (name) => {
  const entry = startedProcesses.find((p) => p.name === name);
  if (!entry) return;
  const proc = entry.proc;
  if (proc.killed) return;
  try { proc.kill('SIGTERM'); } catch {}
  setTimeout(() => {
    if (!proc.killed) {
      try { proc.kill('SIGKILL'); } catch {}
    }
  }, 5000);
};

const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error('\n\x1b[33m[dev:local] Received ' + signal + ', shutting down...\x1b[0m');

  stopProcess('api');
  stopProcess('daemon');

  info('Stopping PostgreSQL (docker compose down)...');
  try {
    run('docker', ['compose', '-f', COMPOSE_FILE, 'down'], { stdio: 'pipe', env: { ...process.env, POSTGRES_PORT } });
  } catch {}

  try {
    if (existsSync(CONTROL_SOCKET_PATH)) unlinkSync(CONTROL_SOCKET_PATH);
  } catch {}

  ok('All processes stopped.');
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

async function main() {
  console.error('\n╔══════════════════════════════════════════════════════════════╗');
  console.error('║  IRP Local Development — Internet Resilience Platform      ║');
  console.error('║  Control Center: http://127.0.0.1:8080/                    ║');
  console.error('╚══════════════════════════════════════════════════════════════╝\n');

  // ── Step 1: Build workspace dependencies ──────────────────────────
  info('Building workspace dependencies...');
  const buildPackages = ['@irp/config', '@irp/core', '@irp/logger', '@irp/auth', '@irp/events', '@irp/database', '@irp/telemetry', '@irp/network', '@irp/connectivity', '@irp/resilience-runtime', '@irp/daemon', '@irp/api'];
  for (const pkg of buildPackages) {
    info('Building ' + pkg + '...');
    const b = run('pnpm', ['--filter', pkg, 'run', 'build'], { stdio: 'pipe' });
    if (b.status !== 0) {
      err('Build failed for ' + pkg + '.');
      console.error(b.stderr ? b.stderr.toString() : '');
      process.exit(1);
    }
  }
  ok('Workspace dependencies built.');

  // ── Step 2: Start PostgreSQL via Docker Compose ───────────────────
  info('Starting PostgreSQL via Docker Compose (port ' + POSTGRES_PORT + ')...');
  const composeUp = run('docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d', 'postgres'], { stdio: 'pipe', env: { ...process.env, POSTGRES_PORT } });
  if (composeUp.status !== 0) {
    err('Failed to start PostgreSQL. Is Docker running?');
    console.error(composeUp.stderr ? composeUp.stderr.toString() : '');
    process.exit(1);
  }
  ok('PostgreSQL container started.');

  // ── Step 3: Wait for PostgreSQL readiness ─────────────────────────
  info('Waiting for PostgreSQL to be ready...');
  await waitForTcp('127.0.0.1', parseInt(POSTGRES_PORT), 60000);
  ok('PostgreSQL is accepting connections.');

  // ── Step 4: Apply database migrations ─────────────────────────────
  info('Applying database migrations (prisma migrate deploy)...');
  const migrateEnv = { ...process.env, DATABASE_URL };
  const prismaDir = join(REPO_ROOT, 'packages/database');
  const migrate = runCapture(PRISMA_BIN, ['migrate', 'deploy'], { cwd: prismaDir, env: migrateEnv });
  if (migrate.status !== 0) {
    err('Database migration failed.');
    console.error(migrate.stderr ? migrate.stderr.toString() : '');
    process.exit(1);
  }
  ok('Database migrations applied.');

  // ── Step 5: Start the IRP daemon on the host ──────────────────────
  info('Starting IRP daemon on the host (observing real Linux network)...');
  const daemonEnv = {
    ...process.env,
    DATABASE_URL,
    NODE_ENV: 'development',
    JWT_SECRET: process.env.JWT_SECRET || 'development-secret-development-secret-32',
    IRP_RUNTIME_MODE: 'simulation',
    IRP_CONTROL_SOCKET: CONTROL_SOCKET_PATH,
    IRP_STATE_DIR: STATE_DIR,
  };

  mkdirSync(daemonEnv.IRP_STATE_DIR, { recursive: true });

  const daemon = spawn('node', [DAEMON_ENTRY], {
    env: daemonEnv,
    stdio: 'inherit',
  });
  startedProcesses.push({ name: 'daemon', proc: daemon });

  daemon.on('exit', (code, signal) => {
    if (!shuttingDown && code !== 0) {
      err('Daemon exited unexpectedly (code=' + code + ', signal=' + signal + ')');
    }
  });

  info('Waiting for daemon control socket at ' + CONTROL_SOCKET_PATH + '...');
  await waitForSocket(CONTROL_SOCKET_PATH, 60000);
  ok('Daemon control socket is ready.');

  // ── Step 6: Start the IRP API on the host ─────────────────────────
  info('Starting IRP API on the host...');
  const apiEnv = {
    ...process.env,
    DATABASE_URL,
    NODE_ENV: 'development',
    JWT_SECRET: process.env.JWT_SECRET || 'development-secret-development-secret-32',
    API_HOST: '0.0.0.0',
    API_PORT: String(API_PORT),
    IRP_PUBLIC_BASE_URL: API_BASE,
    IRP_EMAIL_WEBHOOK_URL: '',
    IRP_BOOTSTRAP_ADMIN_EMAILS: process.env.IRP_BOOTSTRAP_ADMIN_EMAILS || 'admin@local.dev',
  };

  const api = spawn('node', [API_ENTRY], {
    env: apiEnv,
    stdio: 'inherit',
  });
  startedProcesses.push({ name: 'api', proc: api });

  api.on('exit', (code, signal) => {
    if (!shuttingDown && code !== 0) {
      err('API exited unexpectedly (code=' + code + ', signal=' + signal + ')');
    }
  });

  info('Waiting for API readiness...');
  await waitForHttp(API_BASE + '/api/v1/ready', 60000);
  ok('API is ready.');

  // ── Step 7: Verify all services ───────────────────────────────────
  info('Verifying service readiness...');

  try {
    const http = await import('node:http');
    const daemonHealth = await new Promise((resolve, reject) => {
      const req = http.default.get({
        socketPath: CONTROL_SOCKET_PATH,
        method: 'GET',
        path: '/v1/health',
        timeout: 10000,
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve(data); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
    ok('Daemon health: ' + JSON.stringify(daemonHealth).slice(0, 200));
  } catch (e) {
    warn('Daemon health check failed: ' + e);
  }

  try {
    const res = await fetch(API_BASE + '/api/v1/health');
    const health = await res.json();
    ok('API health: ' + JSON.stringify(health).slice(0, 200));
  } catch (e) {
    warn('API health check failed: ' + e);
  }

  // ── Step 8: Print service information ─────────────────────────────
  console.error(`
╔══════════════════════════════════════════════════════════════╗
║  IRP Local Development — All Services Running                ║
╠══════════════════════════════════════════════════════════════╣
║  Control Center:     ${API_BASE}/                                    ║
║  API health:         ${API_BASE}/api/v1/health                   ║
║  API ready:          ${API_BASE}/api/v1/ready                    ║
║  API version:        ${API_BASE}/api/v1/version                  ║
║  Platform status:    ${API_BASE}/api/v1/platform/status          ║
║  API docs (Swagger): ${API_BASE}/docs                            ║
║                                                    ║
║  Daemon control:     ${CONTROL_SOCKET_PATH}                          ║
║  PostgreSQL:         127.0.0.1:${POSTGRES_PORT} (irp/irp)          ║
║                                                    ║
║  Daemon mode:        simulation (observe-only, no host changes)  ║
║  Runtime authority:  @irp/resilience-runtime (canonical)         ║
║                                                    ║
║  Super Admin:        Use IRP_BOOTSTRAP_ADMIN_EMAILS or register  ║
║                      and verify an account to sign in.           ║
║                                                    ║
║  Press Ctrl+C to stop all services.                            ║
╚══════════════════════════════════════════════════════════════╝
`);
}

main().catch((error) => {
  err('Fatal: ' + error.message);
  shutdown('SIGTERM');
});
