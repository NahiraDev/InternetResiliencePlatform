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

  it('reports every missing production dependency together', () => {
    expect(() => validateProductionApiEnvironment({
      VERCEL: '1',
      VERCEL_ENV: 'production',
      DATABASE_URL: 'postgresql://postgres:secret@127.0.0.1:5432/postgres',
    })).toThrow(/JWT_SECRET is required/);
    try {
      validateProductionApiEnvironment({
        VERCEL: '1',
        VERCEL_ENV: 'production',
        DATABASE_URL: 'postgresql://postgres:secret@127.0.0.1:5432/postgres',
      });
    } catch (error) {
      expect(error.message).toContain('IRP_EMAIL_WEBHOOK_URL is required');
      expect(error.message).toContain('IRP_PUBLIC_BASE_URL is required');
      expect(error.message).toContain('managed database');
      expect(error.message).not.toContain('secret');
    }
  });

  it('rejects non-runtime roles, unverified TLS and missing CA references', () => {
    expect(() => validateProductionApiEnvironment({
      ...productionEnv,
      DATABASE_URL: 'postgresql://postgres:secret@db.example.test:5432/postgres',
    })).toThrow(/least-privilege irp_runtime role/);
  });

  it('rejects insecure email and public URLs', () => {
    expect(() => validateProductionApiEnvironment({
      ...productionEnv,
      IRP_EMAIL_WEBHOOK_URL: 'http://mail.example.test/send',
      IRP_PUBLIC_BASE_URL: 'http://app.example.test',
    })).toThrow(/must use https/);
  });
});
