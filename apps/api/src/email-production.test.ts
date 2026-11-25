import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryIdentityRepositories } from './identity/memory.js';
import {
  CapturingEmailSender,
  resolveEmailSender,
  resolvePublicBaseUrl,
  WebhookEmailSender,
} from './identity/mailer.js';
import { buildServer } from './index.js';
import { createMemorySettingsStore } from './durability.js';
import { createMemoryRemoteClientStore } from './remote-client-store.js';

/** Issue #412: authentication must fail closed in production without real email infrastructure. */
const prod = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;

const stores = () => ({
  identity: createMemoryIdentityRepositories(),
  remoteClientStore: createMemoryRemoteClientStore({ credentialKey: 'c'.repeat(48), refreshKey: 'r'.repeat(48) }),
  settings: createMemorySettingsStore(),
});

describe('production email fail-closed', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(['production', 'staging'])('%s: no relay URL refuses to resolve a sender', (NODE_ENV) => {
    expect(() => resolveEmailSender({ NODE_ENV } as NodeJS.ProcessEnv)).toThrow(/IRP_EMAIL_WEBHOOK_URL is required/);
  });
  it('production: a plain-http relay is refused and the capture sender is never used', () => {
    expect(() => resolveEmailSender({ ...prod, IRP_EMAIL_WEBHOOK_URL: 'http://relay.example' })).toThrow(/https/);
    expect(resolveEmailSender({ ...prod, IRP_EMAIL_WEBHOOK_URL: 'https://relay.example/send' })).toBeInstanceOf(
      WebhookEmailSender,
    );
  });
  it.each([undefined, '', 'not a url', 'http://irp.example', 'https://irp.example/?x=1'])(
    'production: IRP_PUBLIC_BASE_URL %j is refused',
    (IRP_PUBLIC_BASE_URL) => {
      expect(() => resolvePublicBaseUrl({ ...prod, IRP_PUBLIC_BASE_URL } as NodeJS.ProcessEnv)).toThrow(
        /IRP_PUBLIC_BASE_URL/,
      );
    },
  );
  it('production: a valid https base URL is accepted; development may omit it', () => {
    expect(resolvePublicBaseUrl({ ...prod, IRP_PUBLIC_BASE_URL: 'https://irp.example' })).toBe('https://irp.example');
    expect(resolvePublicBaseUrl({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBeUndefined();
  });
  it('buildServer in production refuses to start without relay or without base URL', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'j'.repeat(48));
    vi.stubEnv('REMOTE_CLIENT_CREDENTIAL_KEY', 'c'.repeat(48));
    vi.stubEnv('REMOTE_CLIENT_REFRESH_KEY', 'r'.repeat(48));
    vi.stubEnv('IRP_EMAIL_WEBHOOK_URL', '');
    vi.stubEnv('IRP_PUBLIC_BASE_URL', 'https://irp.example');
    await expect(buildServer(stores())).rejects.toThrow(/IRP_EMAIL_WEBHOOK_URL/);
    vi.stubEnv('IRP_EMAIL_WEBHOOK_URL', 'https://relay.example/send');
    vi.stubEnv('IRP_PUBLIC_BASE_URL', '');
    await expect(buildServer(stores())).rejects.toThrow(/IRP_PUBLIC_BASE_URL/);
  });
});

describe('webhook relay contract (local stand-in, NOT production evidence)', () => {
  let server: Server | undefined;
  afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));
  const relay = async (status: number) => {
    const received: Array<{ auth?: string | undefined; body: Record<string, string> }> = [];
    server = createServer((req, res) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        received.push({ auth: req.headers.authorization, body: JSON.parse(data) });
        res.statusCode = status;
        res.end();
      });
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/send`, received };
  };
  const message = { to: 'a@b.co', kind: 'email_verification' as const, subject: 's', text: 't', token: 'tok' };

  it('delivers the message with bearer auth and throws on any non-2xx', async () => {
    const ok = await relay(202);
    await new WebhookEmailSender(ok.url, 'secret').send(message);
    expect(ok.received[0]).toMatchObject({ auth: 'Bearer secret', body: { to: 'a@b.co', token: 'tok' } });
    await new Promise<void>((r) => server!.close(() => r()));
    const bad = await relay(503);
    await expect(new WebhookEmailSender(bad.url).send(message)).rejects.toThrow(/HTTP 503/);
  });

  it('registration reports emailDelivery=failed (never "sent") when the relay rejects', async () => {
    const bad = await relay(500);
    const app = await buildServer({
      identity: createMemoryIdentityRepositories(),
      mailer: new WebhookEmailSender(bad.url),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      remoteAddress: '10.4.4.4',
      payload: { email: 'new@example.com', name: 'N', password: 'Production12345' },
    });
    expect(JSON.stringify(res.json())).not.toContain('"emailDelivery":"sent"');
    expect(new CapturingEmailSender().mode).toBe('development-capture');
    await app.close();
  });
});
