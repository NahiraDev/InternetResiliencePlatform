import { describe, expect, it } from 'vitest';
import { validateProductionApiEnvironment } from '../../../scripts/validate-production-api-env.mjs';

const productionEnv = {
  VERCEL: '1',
  VERCEL_ENV: 'production',
  DATABASE_URL: 'postgresql://irp_runtime.gsckqqpwuqzpfedpeojb:secret@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=verify-full&sslrootcert=%2Fvar%2Ftask%2Fcerts%2Fsupabase-root.crt',
  JWT_SECRET: 'jwt-secret-not-printed',
  REMOTE_CLIENT_CREDENTIAL_KEY: 'credential-key-not-printed',
  REMOTE_CLIENT_REFRESH_KEY: 'refresh-key-not-printed',
  IRP_EMAIL_WEBHOOK_URL: 'https://mail-relay.example.test/send',
  IRP_PUBLIC_BASE_URL: 'https://app.example.test',
};

describe('Vercel production API environment preflight', () => {
  it('does not block local or preview builds', () => {
    expect(validateProductionApiEnvironment({ NODE_ENV: 'production' })).toEqual([]);
    expect(validateProductionApiEnvironment({ VERCEL: '1', VERCEL_ENV: 'preview' })).toEqual([]);
  });

  it('accepts complete production configuration without exposing values', () => {
    expect(validateProductionApiEnvironment(productionEnv)).toEqual([]);
  });

  it('reports every missing production dependency together without exposing credentials', () => {
    const databasePassword = 'db-password-must-not-leak-9f4d2a';
    const databaseUrl = `postgresql://postgres:${databasePassword}@127.0.0.1:5432/postgres`;
    const env = {
      VERCEL: '1',
      VERCEL_ENV: 'production',
      DATABASE_URL: databaseUrl,
    };

    expect(() => validateProductionApiEnvironment(env)).toThrow(/JWT_SECRET is required/);

    let message = '';
    try {
      validateProductionApiEnvironment(env);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('IRP_EMAIL_WEBHOOK_URL is required');
    expect(message).toContain('IRP_PUBLIC_BASE_URL is required');
    expect(message).toContain('managed database');
    expect(message).not.toContain(databasePassword);
    expect(message).not.toContain(databaseUrl);
  });

  it('rejects non-runtime roles, unverified TLS and missing CA references', () => {
    expect(() => validateProductionApiEnvironment({
      ...productionEnv,
      DATABASE_URL: 'postgresql://postgres:secret@db.example.test:5432/postgres',
    })).toThrow(/least-privilege irp_runtime role/);
  });

  it('requires the Supabase transaction pooler endpoint', () => {
    expect(() => validateProductionApiEnvironment({
      ...productionEnv,
      DATABASE_URL: 'postgresql://irp_runtime.project:secret@db.project.supabase.co:5432/postgres?sslmode=verify-full&sslrootcert=%2Fvar%2Ftask%2Froot.crt',
    })).toThrow(/Supabase transaction pooler/);
  });

  it('rejects insecure email and public URLs', () => {
    expect(() => validateProductionApiEnvironment({
      ...productionEnv,
      IRP_EMAIL_WEBHOOK_URL: 'http://mail.example.test/send',
      IRP_PUBLIC_BASE_URL: 'http://app.example.test',
    })).toThrow(/must use https/);
  });
});
