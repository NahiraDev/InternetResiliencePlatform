import { findField } from '@irp/config/secure';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveEmailSender, resolvePublicBaseUrl } from './identity/mailer.js';
import { buildServer } from './index.js';
import { resolveRemoteClientKeys } from './remote-client-api.js';
import { prepareSecureEnvironment, redactConfigValues } from './secure-start.js';
import { resolveTrustProxy } from './security/trust-proxy.js';

// Test fixtures only.
const FIXTURE = {
  DATABASE_URL: 'postgresql://fixture_user:fixture-db-pass@127.0.0.1:1/fixture',
  JWT_SECRET: 'fixture-jwt-0123456789abcdefghijklmnop',
  REMOTE_CLIENT_CREDENTIAL_KEY: 'fixture-credential-0123456789abcdefghij',
  REMOTE_CLIENT_REFRESH_KEY: 'fixture-refresh-0123456789abcdefghijkl',
  IRP_EMAIL_WEBHOOK_URL: 'https://relay.fixture.test/hook',
  IRP_PUBLIC_BASE_URL: 'https://app.fixture.test',
};
const source = (values: Record<string, string>) => ({ read: async () => ({ values }) });

afterEach(() => vi.unstubAllEnvs());

describe('secure start environment', () => {
  it('satisfies the existing production resolvers', async () => {
    const env: NodeJS.ProcessEnv = {};
    await prepareSecureEnvironment(env, source(FIXTURE));
    expect(env.NODE_ENV).toBe('production');
    expect(env.API_HOST).toBe('127.0.0.1');
    expect(resolveEmailSender(env).mode).toBe('webhook');
    expect(resolvePublicBaseUrl(env)).toBe(FIXTURE.IRP_PUBLIC_BASE_URL);
  });

  it('keeps a saved listen address and an explicit NODE_ENV', async () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'staging' };
    await prepareSecureEnvironment(env, source({ ...FIXTURE, API_HOST: '0.0.0.0' }));
    expect(env.NODE_ENV).toBe('staging');
    expect(env.API_HOST).toBe('0.0.0.0');
  });

  it('feeds the unchanged server and key resolution', async () => {
    for (const name of Object.keys(FIXTURE)) vi.stubEnv(name, '');
    await prepareSecureEnvironment(process.env, source(FIXTURE));
    expect(resolveRemoteClientKeys()).toEqual({
      jwtSecret: FIXTURE.JWT_SECRET,
      credentialKey: FIXTURE.REMOTE_CLIENT_CREDENTIAL_KEY,
      refreshKey: FIXTURE.REMOTE_CLIENT_REFRESH_KEY,
    });
    // Port 1 is closed: the server composes from the loaded settings and reports the database down.
    const app = await buildServer();
    const ready = await app.inject({ method: 'GET', url: '/api/v1/ready' });
    expect(ready.statusCode).toBe(503);
    expect(ready.body).not.toContain('fixture-db-pass');
    await app.close();
  });

  it('leaves the existing production fail-closed behaviour in place', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', '');
    vi.stubEnv('DATABASE_URL', '');
    await expect(buildServer()).rejects.toThrow(/JWT_SECRET is required/);
  });

  it('never accepts a value that the runtime parsers reject', () => {
    const proxies = [
      'false',
      '1',
      '32',
      'loopback,10.0.0.0/8',
      '127.0.0.1',
      'fd00::/8',
      '::1',
      '::ffff:10.0.0.1',
      'fe80::1%eth0',
      'true',
      '0',
      '999.0.0.1',
    ];
    for (const value of proxies) {
      if (findField('IRP_TRUST_PROXY')!.check(value)) continue;
      expect(() =>
        resolveTrustProxy({ IRP_TRUST_PROXY: value, NODE_ENV: 'production' }),
      ).not.toThrow();
    }
    expect(findField('IRP_TRUST_PROXY')!.check('::ffff:10.0.0.1')).toBeDefined();
    expect(findField('IRP_EMAIL_WEBHOOK_URL')!.check('HTTPS://relay.fixture.test/x')).toBeDefined();
  });

  it('redacts a database password with a malformed escape or in the query string', () => {
    const env = { DATABASE_URL: 'postgresql://u:ab%zzcd@h.test/d?password=query-fixture' };
    expect(redactConfigValues('ab%zzcd query-fixture', env)).toBe('[REDACTED] [REDACTED]');
  });

  it('redacts secrets and the database password from startup errors', () => {
    const message = redactConfigValues(
      `bad ${FIXTURE.DATABASE_URL} pw=fixture-db-pass key=${FIXTURE.JWT_SECRET}`,
      FIXTURE,
    );
    expect(message).toBe('bad [REDACTED] pw=[REDACTED] key=[REDACTED]');
  });
});
