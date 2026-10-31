import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, statSync, readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LinuxClientServer, type LinuxSystemAdapter, type NetworkSnapshot } from './index.js';
import { isAllowedHost, issueControlToken } from './http-guard.js';

const snapshot: NetworkSnapshot = { interfaces: 'eth0', routes: 'default', dns: 'x', capturedAt: '2026-01-01T00:00:00.000Z' };
class FakeSystem implements LinuxSystemAdapter {
  policy = { autonomousMode: false };
  async snapshot() { return snapshot; }
  async setAutonomousMode(enabled: boolean) { this.policy = { autonomousMode: enabled }; }
  getPolicy() { return { ...this.policy }; }
}

const TOKEN = 'a'.repeat(64);
let server: LinuxClientServer | undefined;
let dir: string | undefined;
afterEach(async () => {
  await server?.stop();
  server = undefined;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

const boot = async (token: string | null = TOKEN) => {
  const system = new FakeSystem();
  server = new LinuxClientServer(system, undefined, token ?? undefined);
  await server.start(0);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no tcp address');
  return { system, port: address.port };
};

const send = (port: number, opts: { method?: string; path?: string; headers?: Record<string, string>; body?: string }) =>
  new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, method: opts.method ?? 'GET', path: opts.path ?? '/', headers: opts.headers }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });

const authed = (port: number, extra: Record<string, string> = {}) => ({
  'content-type': 'application/json',
  authorization: `Bearer ${TOKEN}`,
  ...extra,
});

describe('POST /policy', () => {
  it('rejects requests without a token and changes nothing', async () => {
    const { system, port } = await boot();
    const r = await send(port, { method: 'POST', path: '/policy', headers: { 'content-type': 'application/json' }, body: '{"autonomousMode":true}' });
    expect(r.status).toBe(401);
    expect(system.getPolicy().autonomousMode).toBe(false);
  });

  it('rejects a wrong token', async () => {
    const { system, port } = await boot();
    const r = await send(port, { method: 'POST', path: '/policy', headers: { 'content-type': 'application/json', authorization: `Bearer ${'b'.repeat(64)}` }, body: '{"autonomousMode":true}' });
    expect(r.status).toBe(401);
    expect(system.getPolicy().autonomousMode).toBe(false);
  });

  it('is disabled (fail-closed) when no token is configured', async () => {
    const { system, port } = await boot(null);
    const r = await send(port, { method: 'POST', path: '/policy', headers: authed(port), body: '{"autonomousMode":true}' });
    expect(r.status).toBe(403);
    expect(system.getPolicy().autonomousMode).toBe(false);
  });

  it('refuses a cross-site HTML form post (form content type, foreign origin, no token)', async () => {
    const { system, port } = await boot();
    const r = await send(port, {
      method: 'POST', path: '/policy',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.example' },
      body: 'autonomousMode=true',
    });
    expect(r.status).toBe(403);
    expect(system.getPolicy().autonomousMode).toBe(false);
  });

  it('refuses a foreign Origin even with a valid token, and Origin: null', async () => {
    const { system, port } = await boot();
    for (const origin of ['https://evil.example', 'null', `http://localhost:${port + 1}`]) {
      const r = await send(port, { method: 'POST', path: '/policy', headers: authed(port, { origin }), body: '{"autonomousMode":true}' });
      expect(r.status).toBe(403);
    }
    expect(system.getPolicy().autonomousMode).toBe(false);
  });

  it('refuses DNS-rebinding Host headers on reads and writes', async () => {
    const { port } = await boot();
    expect((await send(port, { path: '/health', headers: { host: `evil.example:${port}` } })).status).toBe(403);
    expect((await send(port, { path: '/health', headers: { host: '127.0.0.1:1' } })).status).toBe(403);
    expect((await send(port, { method: 'POST', path: '/policy', headers: authed(port, { host: `rebind.example:${port}` }), body: '{"autonomousMode":true}' })).status).toBe(403);
  });

  it('requires application/json', async () => {
    const { system, port } = await boot();
    const r = await send(port, { method: 'POST', path: '/policy', headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Bearer ${TOKEN}` }, body: 'autonomousMode=true' });
    expect(r.status).toBe(415);
    expect(system.getPolicy().autonomousMode).toBe(false);
  });

  it('validates the body strictly', async () => {
    const { system, port } = await boot();
    for (const body of ['not json', '[]', '{}', '{"autonomousMode":"true"}', '{"autonomousMode":true,"mode":"live"}', '{"mode":"live"}', '{"autonomousMode":true,"capabilities":["route.write"]}'])
      expect((await send(port, { method: 'POST', path: '/policy', headers: authed(port), body })).status).toBe(400);
    expect((await send(port, { method: 'POST', path: '/policy', headers: authed(port), body: `{"autonomousMode":true,"pad":"${'x'.repeat(2000)}"}` })).status).toBe(413);
    expect(system.getPolicy().autonomousMode).toBe(false);
  });

  it('accepts an authorized, same-origin, valid request and routes it through the runtime', async () => {
    const { system, port } = await boot();
    const r = await send(port, { method: 'POST', path: '/policy', headers: authed(port, { origin: `http://127.0.0.1:${port}` }), body: '{"autonomousMode":true}' });
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ autonomousMode: true });
    expect(system.getPolicy().autonomousMode).toBe(true);
    const health = JSON.parse((await send(port, { path: '/health' })).body);
    expect(health.autonomousMode).toBe(true);
  });

  it('no longer serves a browser form that can toggle autonomy', async () => {
    const { port } = await boot();
    const page = (await send(port, { path: '/' })).body;
    expect(page).not.toMatch(/<form/i);
  });
});

describe('host matching and token issuance', () => {
  it('accepts only loopback names on the serving port', () => {
    expect(isAllowedHost('127.0.0.1:8080', 8080)).toBe(true);
    expect(isAllowedHost('localhost:8080', 8080)).toBe(true);
    expect(isAllowedHost('[::1]:8080', 8080)).toBe(true);
    expect(isAllowedHost('localhost.evil.com:8080', 8080)).toBe(false);
    expect(isAllowedHost('127.0.0.1:9', 8080)).toBe(false);
    expect(isAllowedHost(undefined, 8080)).toBe(false);
    expect(isAllowedHost('0.0.0.0:8080', 8080)).toBe(false);
  });

  it('writes a fresh 256-bit token to an owner-only file', () => {
    dir = mkdtempSync(join(tmpdir(), 'irp-token-'));
    const path = join(dir, 'state', 'linux-client.token');
    const t1 = issueControlToken(path);
    expect(t1).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(path, 'utf8').trim()).toBe(t1);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(join(path, '..')).mode & 0o777).toBe(0o700);
    expect(issueControlToken(path)).not.toBe(t1);
  });
});
