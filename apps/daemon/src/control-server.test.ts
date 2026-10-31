import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ControlClientError, ControlConflictError, ControlServer, controlRequest, type ControlPort } from './control-server.js';

const dirs: string[] = [];
const servers: ControlServer[] = [];
const fresh = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'irp-ctl-'));
  dirs.push(d);
  return join(d, 'run', 'irp.sock');
};
const calls: string[] = [];
const port: ControlPort = {
  health: async () => ({ status: 'ok' }),
  snapshot: async () => ({ snap: true }),
  decisions: async () => [],
  incidents: async () => [],
  capabilities: () => ['network.observe'],
  cycle: async (mode) => { calls.push(mode); return { ran: mode }; },
  reload: async () => ({ reloaded: true }),
};
const start = async (path: string): Promise<ControlServer> => {
  const s = new ControlServer(path, port);
  await s.start();
  servers.push(s);
  return s;
};
afterEach(async () => {
  calls.length = 0;
  while (servers.length) await servers.pop()!.stop();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('ControlServer', () => {
  it('serves routes over an owner-only socket in an owner-only directory', async () => {
    const path = fresh();
    await start(path);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(join(path, '..')).mode & 0o777).toBe(0o700);
    expect(await controlRequest(path, 'GET', '/v1/health')).toEqual({ status: 'ok' });
    expect(await controlRequest(path, 'POST', '/v1/reload')).toEqual({ reloaded: true });
  });

  it('runs safe and simulation cycles but rejects live over the socket', async () => {
    const path = fresh();
    await start(path);
    expect(await controlRequest(path, 'POST', '/v1/cycle', { mode: 'simulation' })).toEqual({ ran: 'simulation' });
    expect(await controlRequest(path, 'POST', '/v1/cycle', {})).toEqual({ ran: 'safe' });
    await expect(controlRequest(path, 'POST', '/v1/cycle', { mode: 'live' })).rejects.toMatchObject({ status: 400 });
    expect(calls).toEqual(['simulation', 'safe']);
  });

  it('rejects oversized and malformed bodies and unknown routes', async () => {
    const path = fresh();
    await start(path);
    await expect(controlRequest(path, 'POST', '/v1/cycle', { mode: 'x'.repeat(8000) })).rejects.toMatchObject({ status: 413 });
    await expect(controlRequest(path, 'GET', '/v1/nope')).rejects.toMatchObject({ status: 404 });
  });

  it('replaces a stale socket left by a killed process but refuses to steal a live one', async () => {
    const path = fresh();
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    // A real crash: a separate process binds the socket and is SIGKILLed, leaving the file behind.
    const child = spawn(process.execPath, ['-e', `require('net').createServer().listen(${JSON.stringify(path)},()=>console.log('up'))`], { stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise<void>((resolve) => child.stdout!.once('data', () => resolve()));
    const live = new ControlServer(path, port);
    await expect(live.start()).rejects.toThrow(/already listening/);
    child.kill('SIGKILL');
    await new Promise((resolve) => child.once('exit', resolve));
    expect(existsSync(path)).toBe(true);
    await start(path);
    expect(await controlRequest(path, 'GET', '/v1/health')).toEqual({ status: 'ok' });
  });

  it('removes the socket on stop and reports an unreachable daemon clearly', async () => {
    const path = fresh();
    const s = await start(path);
    await s.stop();
    servers.pop();
    expect(existsSync(path)).toBe(false);
    const error = await controlRequest(path, 'GET', '/v1/health').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ControlClientError);
    expect((error as ControlClientError).code).toBe('unreachable');
  });
});

describe('ControlServer concurrency', () => {
  it('reports an overlapping cycle as 409 and runs only one at a time', async () => {
    const path = fresh();
    let release: () => void = () => undefined;
    let active = 0;
    let maxActive = 0;
    const slow: ControlPort = {
      ...port,
      cycle: async () => {
        if (active > 0) throw new ControlConflictError('a runtime cycle is already running');
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise<void>((resolve) => { release = resolve; });
        active -= 1;
        return { ok: true };
      },
    };
    const s = new ControlServer(path, slow);
    await s.start();
    servers.push(s);
    const first = controlRequest(path, 'POST', '/v1/cycle', { mode: 'safe' });
    await new Promise((r) => setTimeout(r, 50));
    await expect(controlRequest(path, 'POST', '/v1/cycle', { mode: 'safe' })).rejects.toMatchObject({ status: 409 });
    release();
    await expect(first).resolves.toEqual({ ok: true });
    expect(maxActive).toBe(1);
  });
});
