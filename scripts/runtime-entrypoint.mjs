#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { loadConfig } from '../packages/config/dist/index.js';
import { buildServer } from '../apps/api/dist/index.js';

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

const server = await buildServer();
let shuttingDown = false;
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  log('info', 'shutdown requested', { signal });
  try {
    await server.close();
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
