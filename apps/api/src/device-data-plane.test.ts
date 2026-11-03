import { describe, expect, it } from 'vitest';
import { buildServer } from './index.js';
import { CapturingEmailSender } from './identity/mailer.js';
import { JwtService } from '@irp/auth';

const mailer = new CapturingEmailSender();

const bootstrapAdminToken = async (app: Awaited<ReturnType<typeof buildServer>>) => {
  process.env.IRP_BOOTSTRAP_ADMIN_EMAILS = 'admin@example.com';
  const register = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email: 'admin@example.com', name: 'Admin', password: 'Production12345' },
  });
  expect(register.statusCode).toBe(201);
  const message = mailer.last('email_verification', 'admin@example.com');
  expect(message).toBeDefined();
  const verify = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/email-verification/confirm',
    payload: { token: message!.token },
  });
  expect(verify.statusCode).toBe(200);
  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: 'admin@example.com', password: 'Production12345' },
  });
  expect(login.statusCode).toBe(200);
  const token = login.json().data.accessToken;
  delete process.env.IRP_BOOTSTRAP_ADMIN_EMAILS;
  return token;
};

const enrollDevice = async (
  app: Awaited<ReturnType<typeof buildServer>>,
  adminToken: string,
  platform: string,
  deviceId: string,
) => {
  const enrollment = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/remote/devices/enroll',
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { deviceId, platform, label: `test-${platform}`, scopes: ['runtime.read'] },
  });
  expect(enrollment.statusCode).toBe(201);
  return enrollment.json().data;
};

const exchangeCredential = async (
  app: Awaited<ReturnType<typeof buildServer>>,
  credentialId: string,
  secret: string,
) => {
  const token = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/remote/token',
    payload: { credentialId, secret },
  });
  expect(token.statusCode).toBe(200);
  return token.json().data;
};

describe('device data plane API', () => {
  it('returns snapshot, analytics, and policy for an enrolled device', async () => {
    const app = await buildServer({ mailer });
    const adminToken = await bootstrapAdminToken(app);
    const device = await enrollDevice(app, adminToken, 'android', 'device-android-1');
    const issued = await exchangeCredential(app, device.credentialId, device.secret);
    const accessToken = issued.accessToken;

    const snapshot = await app.inject({
      method: 'GET',
      url: '/api/v1/remote/devices/device-android-1/snapshot',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(snapshot.statusCode).toBe(200);
    expect(snapshot.json().data.connection).toBeTypeOf('string');
    expect(snapshot.json().data.interfaceCount).toBeTypeOf('number');

    const analytics = await app.inject({
      method: 'GET',
      url: '/api/v1/remote/devices/device-android-1/analytics',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(analytics.statusCode).toBe(200);
    expect(analytics.json().data.sampleCount).toBeTypeOf('number');

    const policy = await app.inject({
      method: 'GET',
      url: '/api/v1/remote/devices/device-android-1/policy',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(policy.statusCode).toBe(200);
    expect(policy.json().data.autonomousMode).toBeTypeOf('boolean');

    await app.close();
  }, 15000);

  it('rejects requests without authentication', async () => {
    const app = await buildServer({ mailer });
    const adminToken = await bootstrapAdminToken(app);
    const device = await enrollDevice(app, adminToken, 'android', 'device-android-2');
    const issued = await exchangeCredential(app, device.credentialId, device.secret);

    // No auth header at all
    const snapshot = await app.inject({
      method: 'GET',
      url: '/api/v1/remote/devices/device-android-2/snapshot',
    });
    expect(snapshot.statusCode).toBe(401);

    const analytics = await app.inject({
      method: 'GET',
      url: '/api/v1/remote/devices/device-android-2/analytics',
    });
    expect(analytics.statusCode).toBe(401);

    const policy = await app.inject({
      method: 'GET',
      url: '/api/v1/remote/devices/device-android-2/policy',
    });
    expect(policy.statusCode).toBe(401);

    const setPolicy = await app.inject({
      method: 'POST',
      url: '/api/v1/remote/devices/device-android-2/policy',
      payload: { autonomousMode: true },
    });
    expect(setPolicy.statusCode).toBe(401);

    await app.close();
  }, 15000);

  it('enforces device ownership: client cannot access another device', async () => {
    const app = await buildServer({ mailer });
    const adminToken = await bootstrapAdminToken(app);

    // Enroll two devices under the same admin
    const deviceA = await enrollDevice(app, adminToken, 'android', 'device-owner-a');
    const deviceB = await enrollDevice(app, adminToken, 'ios', 'device-owner-b');

    // Client A gets its own token
    const issuedA = await exchangeCredential(app, deviceA.credentialId, deviceA.secret);

    // Client A tries to access device B's snapshot (deviceId mismatch -> 403)
    const snapshotB = await app.inject({
      method: 'GET',
      url: '/api/v1/remote/devices/device-owner-b/snapshot',
      headers: { authorization: `Bearer ${issuedA.accessToken}` },
    });
    expect(snapshotB.statusCode).toBe(403);

    // Client A tries to set device B's policy (deviceId mismatch -> 403)
    const setPolicyB = await app.inject({
      method: 'POST',
      url: '/api/v1/remote/devices/device-owner-b/policy',
      headers: { authorization: `Bearer ${issuedA.accessToken}` },
      payload: { autonomousMode: true },
    });
    expect(setPolicyB.statusCode).toBe(403);

    // Client A CAN access its own device
    const snapshotA = await app.inject({
      method: 'GET',
      url: '/api/v1/remote/devices/device-owner-a/snapshot',
      headers: { authorization: `Bearer ${issuedA.accessToken}` },
    });
    expect(snapshotA.statusCode).toBe(200);

    await app.close();
  }, 15000);

  it('policy POST reaches ResilienceRuntime and changes mode', async () => {
    const app = await buildServer({ mailer });
    const adminToken = await bootstrapAdminToken(app);
    const device = await enrollDevice(app, adminToken, 'android', 'device-policy-1');
    const issued = await exchangeCredential(app, device.credentialId, device.secret);
    const accessToken = issued.accessToken;

    // Get initial policy (should be safe mode by default)
    const initial = await app.inject({
      method: 'GET',
      url: '/api/v1/remote/devices/device-policy-1/policy',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(initial.statusCode).toBe(200);

    // Enable autonomous mode
    const enable = await app.inject({
      method: 'POST',
      url: '/api/v1/remote/devices/device-policy-1/policy',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { autonomousMode: true },
    });
    expect(enable.statusCode).toBe(200);
    expect(enable.json().data.autonomousMode).toBe(true);

    // Disable autonomous mode
    const disable = await app.inject({
      method: 'POST',
      url: '/api/v1/remote/devices/device-policy-1/policy',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { autonomousMode: false },
    });
    expect(disable.statusCode).toBe(200);
    expect(disable.json().data.autonomousMode).toBe(false);

    await app.close();
  }, 15000);

  it('rejects non-remote_client tokens', async () => {
    const app = await buildServer({ mailer });
    const adminToken = await bootstrapAdminToken(app);
    await enrollDevice(app, adminToken, 'android', 'device-non-rc');

    // Create a regular user token (not remote_client)
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'regular@example.com', name: 'Regular', password: 'Production12345' },
    });
    expect(login.statusCode).toBe(201);
    const message = mailer.last('email_verification', 'regular@example.com');
    expect(message).toBeDefined();
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/email-verification/confirm',
      payload: { token: message!.token },
    });
    const regularLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'regular@example.com', password: 'Production12345' },
    });
    expect(regularLogin.statusCode).toBe(200);
    const regularToken = regularLogin.json().data.accessToken;

    const snapshot = await app.inject({
      method: 'GET',
      url: '/api/v1/remote/devices/device-non-rc/snapshot',
      headers: { authorization: `Bearer ${regularToken}` },
    });
    expect(snapshot.statusCode).toBe(403);

    await app.close();
  }, 15000);

  it('returns data for the enrolled device (deviceId matches token sub)', async () => {
    const app = await buildServer({ mailer });
    const adminToken = await bootstrapAdminToken(app);
    const device = await enrollDevice(app, adminToken, 'android', 'device-matched-1');
    const issued = await exchangeCredential(app, device.credentialId, device.secret);

    const snapshot = await app.inject({
      method: 'GET',
      url: '/api/v1/remote/devices/device-matched-1/snapshot',
      headers: { authorization: `Bearer ${issued.accessToken}` },
    });
    // Same deviceId as token sub -> 200
    expect(snapshot.statusCode).toBe(200);

    await app.close();
  }, 15000);
});
