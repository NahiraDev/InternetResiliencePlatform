import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SecureConfigError, SecureConfigStore, type KeyStore } from '@irp/config/secure';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { adminPasswordProblem, setAdminPassword } from './config-portal/admin.js';
import { buildPortalServer } from './config-portal/server.js';
import { portalHtml, portalScript } from './config-portal/ui.js';

// Test fixtures only.
const PASSWORD = 'Fixture-Admin-Passw0rd';
const DB = 'postgresql://fixture_user:fixture-db-pass@db.fixture.test:5432/fixture';
const JWT = 'fixture-jwt-0123456789abcdefghijklmnop';
const PORT = 4780;
const HOST = `127.0.0.1:${PORT}`;
const ORIGIN = `http://${HOST}`;

const memoryKeys = (): KeyStore => {
  const keys = new Map<string, Buffer>();
  return {
    description: 'test key store',
    get: async (a) => keys.get(a) ?? null,
    set: async (a, k) => void keys.set(a, k),
  };
};

let root: string;
let store: SecureConfigStore;
let app: FastifyInstance;
let clock: number;
let output: string[];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'irp-portal-'));
  store = await SecureConfigStore.open({ dir: join(root, 's'), keyStore: memoryKeys() });
  await setAdminPassword(store, PASSWORD);
  clock = 1_000_000;
  app = buildPortalServer({ store, port: PORT, now: () => clock });
  output = [];
  const capture = (chunk: unknown) => (output.push(String(chunk)), true);
  vi.spyOn(process.stdout, 'write').mockImplementation(capture);
  vi.spyOn(process.stderr, 'write').mockImplementation(capture);
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const)
    vi.spyOn(console, method).mockImplementation((...args) => void output.push(args.join(' ')));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await app.close();
  await rm(root, { recursive: true, force: true });
});

const call = (options: InjectOptions & { headers?: Record<string, string> }) =>
  app.inject({
    remoteAddress: '127.0.0.1',
    ...options,
    headers: { host: HOST, origin: ORIGIN, ...options.headers },
  });

const login = async () => {
  const response = await call({
    method: 'POST',
    url: '/api/login',
    payload: { password: PASSWORD },
  });
  expect(response.statusCode).toBe(200);
  const cookie = String(response.headers['set-cookie']);
  return {
    setCookie: cookie,
    headers: { cookie: cookie.split(';')[0]!, 'x-csrf-token': response.json().csrfToken as string },
  };
};

describe('local-only and request origin controls', () => {
  it('serves the page to a loopback client with restrictive headers', async () => {
    const response = await call({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('refuses non-loopback peers even with forged headers', async () => {
    for (const remoteAddress of ['192.168.1.20', '10.0.0.5', '::ffff:192.168.1.20', '::1']) {
      const response = await app.inject({
        method: 'GET',
        url: '/',
        remoteAddress,
        headers: { host: HOST, 'x-forwarded-for': '127.0.0.1' },
      });
      expect(response.statusCode).toBe(403);
    }
  });

  it('refuses foreign Host and Origin values', async () => {
    for (const host of ['evil.test', `evil.test:${PORT}`, '127.0.0.1:9999', `localhost:${PORT}`])
      expect((await call({ method: 'GET', url: '/', headers: { host } })).statusCode).toBe(403);
    for (const origin of ['http://evil.test', 'null', 'http://127.0.0.1:9999']) {
      const response = await call({
        method: 'POST',
        url: '/api/login',
        headers: { origin },
        payload: { password: PASSWORD },
      });
      expect(response.statusCode).toBe(403);
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  });

  it('requires Origin on writes and refuses cross-site or non-JSON requests', async () => {
    const noOrigin = await app.inject({
      method: 'POST',
      url: '/api/login',
      remoteAddress: '127.0.0.1',
      headers: { host: HOST },
      payload: { password: PASSWORD },
    });
    expect(noOrigin.statusCode).toBe(403);
    const crossSite = await call({
      method: 'GET',
      url: '/api/config',
      headers: { 'sec-fetch-site': 'same-site' },
    });
    expect(crossSite.statusCode).toBe(403);
    const form = await call({
      method: 'POST',
      url: '/api/login',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `password=${PASSWORD}`,
    });
    expect(form.statusCode).toBe(415);
  });

  it('binds only 127.0.0.1 when listening', async () => {
    await app.listen({ host: '127.0.0.1', port: 0 });
    expect(app.server.address()).toMatchObject({ address: '127.0.0.1' });
    const source = await readFile(new URL('./config-portal/cli.ts', import.meta.url), 'utf8');
    expect(source).toContain('app.listen({ host: PORTAL_HOST, port })');
  });
});

describe('authentication, sessions and CSRF', () => {
  it('rejects unauthenticated reads and writes', async () => {
    expect((await call({ method: 'GET', url: '/api/config' })).statusCode).toBe(401);
    const write = await call({
      method: 'PUT',
      url: '/api/config',
      payload: { values: { JWT_SECRET: JWT } },
    });
    expect(write.statusCode).toBe(401);
    expect((await store.read())!.values).toEqual({});
  });

  it('rejects wrong passwords and locks after repeated failures', async () => {
    const attempt = (password: string) =>
      call({ method: 'POST', url: '/api/login', payload: { password } });
    const results = await Promise.all(Array.from({ length: 8 }, () => attempt('wrong')));
    expect(results.filter((r) => r.statusCode === 401).length).toBeLessThanOrEqual(5);
    expect((await attempt(PASSWORD)).statusCode).toBe(429);
    clock += 16 * 60_000;
    expect((await attempt(PASSWORD)).statusCode).toBe(200);
  });

  it('refuses everyone until an administrator exists', async () => {
    await store.update((current) => ({ values: current.values }));
    const response = await call({
      method: 'POST',
      url: '/api/login',
      payload: { password: PASSWORD },
    });
    expect(response.statusCode).toBe(401);
  });

  it('issues an HttpOnly SameSite=Strict cookie that is useless without the CSRF token', async () => {
    const session = await login();
    expect(session.setCookie).toContain('HttpOnly');
    expect(session.setCookie).toContain('SameSite=Strict');
    const { cookie } = session.headers;
    for (const csrf of [undefined, 'wrong']) {
      const headers = { cookie, ...(csrf ? { 'x-csrf-token': csrf } : {}) };
      expect((await call({ method: 'GET', url: '/api/config', headers })).statusCode).toBe(403);
      const write = await call({
        method: 'PUT',
        url: '/api/config',
        headers,
        payload: { values: { JWT_SECRET: JWT } },
      });
      expect(write.statusCode).toBe(403);
    }
    expect((await store.read())!.values).toEqual({});
  });

  it('expires idle sessions and ends them on logout', async () => {
    const first = await login();
    clock += 11 * 60_000;
    expect(
      (await call({ method: 'GET', url: '/api/config', headers: first.headers })).statusCode,
    ).toBe(401);
    const second = await login();
    await call({ method: 'POST', url: '/api/logout', headers: second.headers, payload: {} });
    expect(
      (await call({ method: 'GET', url: '/api/config', headers: second.headers })).statusCode,
    ).toBe(401);
  });

  it('rate limits write floods, which other sites cannot trigger on the administrator', async () => {
    const post = (origin: string) =>
      call({ method: 'POST', url: '/api/logout', headers: { origin }, payload: {} });
    for (let i = 0; i < 125; i++) {
      await post('http://evil.test');
      await call({ method: 'GET', url: '/x', headers: { 'sec-fetch-site': 'cross-site' } });
    }
    await login();
    let last = 0;
    for (let i = 0; i < 125; i++) last = (await post(ORIGIN)).statusCode;
    expect(last).toBe(429);
  });

  it('enforces the administrator password policy', () => {
    expect(adminPasswordProblem('short')).toBeDefined();
    expect(adminPasswordProblem(PASSWORD)).toBeUndefined();
  });
});

describe('saving and secrecy', () => {
  it('saves, updates and removes without ever returning a value or logging it', async () => {
    const { headers } = await login();
    const responses: string[] = [];
    const send = async (method: 'GET' | 'PUT', payload?: object) => {
      const response = await call({
        method,
        url: '/api/config',
        headers,
        ...(payload ? { payload } : {}),
      });
      responses.push(response.body, JSON.stringify(response.headers));
      return response;
    };
    const saved = await send('PUT', {
      values: {
        DATABASE_URL: DB,
        JWT_SECRET: JWT,
        IRP_PUBLIC_BASE_URL: 'https://app.fixture.test',
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().complete).toBe(false);
    const status = (name: string, body = saved.json()) =>
      body.fields.find((f: { name: string }) => f.name === name).status;
    expect(status('JWT_SECRET')).toBe('configured');
    expect(status('IRP_EMAIL_WEBHOOK_URL')).toBe('missing');

    const replaced = 'fixture-rotated-0123456789abcdefghijk';
    await send('PUT', { values: { JWT_SECRET: replaced } });
    expect((await store.read())!.values.JWT_SECRET).toBe(replaced);
    expect((await store.read())!.values.DATABASE_URL).toBe(DB);
    await send('GET');
    const removed = await send('PUT', { remove: ['JWT_SECRET'] });
    expect(status('JWT_SECRET', removed.json())).toBe('missing');

    const everything = responses.join('\n') + output.join('\n');
    for (const secret of [DB, 'fixture-db-pass', JWT, replaced, 'app.fixture.test', PASSWORD])
      expect(everything).not.toContain(secret);
    expect(everything).not.toContain('scrypt$');
  });

  it('saves nothing when any field is invalid, and does not echo it', async () => {
    const { headers } = await login();
    const response = await call({
      method: 'PUT',
      url: '/api/config',
      headers,
      payload: { values: { DATABASE_URL: DB, JWT_SECRET: 'leak-marker' } },
    });
    expect(response.statusCode).toBe(422);
    expect(Object.keys(response.json().errors)).toEqual(['JWT_SECRET']);
    expect(response.body).not.toContain('leak-marker');
    expect((await store.read())!.values).toEqual({});
  });

  it('never echoes unknown keys, wrong types or malformed bodies', async () => {
    const { headers } = await login();
    for (const payload of [
      JSON.stringify({ values: { 'leak-marker': 'x' } }),
      JSON.stringify({ values: { JWT_SECRET: ['leak-marker'] } }),
      JSON.stringify({ remove: ['leak-marker'] }),
      '{"values":{"JWT_SECRET":leak-marker}}',
      'leak-marker'.repeat(10_000),
    ]) {
      const response = await call({
        method: 'PUT',
        url: '/api/config',
        headers: { ...headers, 'content-type': 'application/json' },
        payload,
      });
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(response.body).not.toContain('leak-marker');
    }
    const missing = await call({ method: 'GET', url: '/leak-marker' });
    expect(missing.body).not.toContain('leak-marker');
    expect(output.join('')).not.toContain('leak-marker');
  });

  it('reports storage failure without details from the request', async () => {
    const { headers } = await login();
    vi.spyOn(store, 'update').mockRejectedValue(
      new SecureConfigError('storage_unavailable', 'Credential store is locked.'),
    );
    const response = await call({
      method: 'PUT',
      url: '/api/config',
      headers,
      payload: { values: { JWT_SECRET: JWT } },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().message).toBe('Credential store is locked.');
    expect(response.body).not.toContain(JWT);
  });

  it('uses no browser storage, external resource or HTML injection sink', () => {
    const assets = portalHtml + portalScript;
    expect(assets).not.toMatch(
      /localStorage|sessionStorage|indexedDB|innerHTML|https:\/\/|console\./,
    );
    expect(() => new Function(portalScript)).not.toThrow();
  });
});
