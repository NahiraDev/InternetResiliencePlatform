import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CliError, createProgram, printJson } from './index.js';

const cleanup: Array<() => void> = [];
afterEach(() => {
  while (cleanup.length) cleanup.pop()!();
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

const serve = async (handler: (url: string, method: string, body: string) => unknown): Promise<string> => {
  const dir = mkdtempSync(join(tmpdir(), 'irp-cli-'));
  const path = join(dir, 'irp.sock');
  const server: Server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const out = handler(req.url ?? '', req.method ?? '', body);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(out));
    });
  });
  await new Promise<void>((r) => server.listen(path, r));
  cleanup.push(() => { server.close(); rmSync(dir, { recursive: true, force: true }); });
  return path;
};

const run = async (...args: string[]): Promise<string> => {
  const lines: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((m: unknown) => void lines.push(String(m)));
  await createProgram().parseAsync(['node', 'irp', ...args]);
  return lines.join('\n');
};

describe('CLI command registration', () => {
  it('registers core commands without parsing process argv at import time', () => {
    const commands = createProgram().commands.map((command) => command.name());
    expect(commands).toEqual(
      expect.arrayContaining(['version', 'status', 'config', 'providers', 'benchmark', 'metrics', 'events', 'reload', 'network', 'runtime', 'doctor']),
    );
  });
  it('no longer ships commands that only pretended to act', () => {
    const commands = createProgram().commands.map((command) => command.name());
    expect(commands).not.toContain('autopilot');
    const runtime = createProgram().commands.find((c) => c.name() === 'runtime')!;
    expect(runtime.commands.map((c) => c.name())).not.toContain('conflicts');
  });
  it('serializes command output as stable pretty JSON', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    printJson({ status: 'created' });
    expect(spy).toHaveBeenCalledWith('{\n  "status": "created"\n}');
  });
});

describe('CLI talks to the running daemon', () => {
  it('status/decisions read from the daemon socket', async () => {
    const socket = await serve((url) => (url === '/v1/health' ? { status: 'ok', from: 'daemon' } : [{ id: 'd1' }]));
    expect(JSON.parse(await run('status', '--socket', socket))).toEqual({ status: 'ok', from: 'daemon' });
    expect(JSON.parse(await run('runtime', 'decisions', '--socket', socket))).toEqual([{ id: 'd1' }]);
  });

  it('cycle posts safe by default, simulation on request', async () => {
    const seen: string[] = [];
    const socket = await serve((url, method, body) => { seen.push(`${method} ${url} ${body}`); return { ok: true }; });
    await run('runtime', 'cycle', '--socket', socket);
    await run('runtime', 'cycle', '--simulate', '--socket', socket);
    expect(seen).toEqual(['POST /v1/cycle {"mode":"safe"}', 'POST /v1/cycle {"mode":"simulation"}']);
  });

  it('refuses a live cycle without contacting the daemon', async () => {
    const seen: string[] = [];
    const socket = await serve((url) => { seen.push(url); return {}; });
    await expect(run('runtime', 'cycle', '--live', '--socket', socket)).rejects.toThrow(CliError);
    expect(seen).toEqual([]);
  });

  it('fails loudly (not with fake output) when no daemon is running', async () => {
    const socket = join(tmpdir(), 'irp-cli-missing', 'none.sock');
    await expect(run('status', '--socket', socket)).rejects.toThrow(/no daemon is listening/);
  });

  it('doctor reports unreachable daemon and exits non-zero', async () => {
    const socket = join(tmpdir(), 'irp-cli-missing', 'none.sock');
    const out = JSON.parse(await run('doctor', '--socket', socket)) as { daemon: { reachable: boolean } };
    expect(out.daemon.reachable).toBe(false);
    expect(process.exitCode).toBe(1);
  });
});
