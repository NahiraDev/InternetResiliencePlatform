#!/usr/bin/env node

/**
 * Fail the Vercel production build before publishing an API deployment that
 * cannot start safely. Preview/local builds remain usable without production
 * credentials. Never print credential values.
 */
export function validateProductionApiEnvironment(env = process.env) {
  if (env.VERCEL !== '1' || env.VERCEL_ENV !== 'production') return [];

  const errors = [];
  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'REMOTE_CLIENT_CREDENTIAL_KEY',
    'REMOTE_CLIENT_REFRESH_KEY',
    'IRP_EMAIL_WEBHOOK_URL',
    'IRP_PUBLIC_BASE_URL',
  ];

  for (const name of required) {
    if (!env[name]?.trim()) errors.push(`${name} is required`);
  }

  if (env.DATABASE_URL?.trim()) {
    try {
      const databaseUrl = new URL(env.DATABASE_URL);
      if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
        errors.push('DATABASE_URL must use PostgreSQL');
      }
      if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(databaseUrl.hostname.toLowerCase())) {
        errors.push('DATABASE_URL must point to the managed database, not a loopback host');
      }
      if (!decodeURIComponent(databaseUrl.username).startsWith('irp_runtime.')) {
        errors.push('DATABASE_URL must authenticate as the least-privilege irp_runtime role');
      }
      if (databaseUrl.searchParams.get('sslmode') !== 'verify-full') {
        errors.push('DATABASE_URL must enable sslmode=verify-full');
      }
      if (!databaseUrl.searchParams.has('sslrootcert')) {
        errors.push('DATABASE_URL must reference the managed database root CA with sslrootcert');
      }
    } catch {
      errors.push('DATABASE_URL must be a valid PostgreSQL connection URL');
    }
  }

  for (const name of ['IRP_EMAIL_WEBHOOK_URL', 'IRP_PUBLIC_BASE_URL']) {
    const value = env[name]?.trim();
    if (!value) continue;
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'https:') errors.push(`${name} must use https://`);
      if (name === 'IRP_PUBLIC_BASE_URL' && (parsed.search || parsed.hash)) {
        errors.push('IRP_PUBLIC_BASE_URL must not contain a query string or fragment');
      }
    } catch {
      errors.push(`${name} must be an absolute HTTPS URL`);
    }
  }

  if (errors.length) {
    throw new Error(
      `[irp-api] Production environment preflight failed:\\n- ${errors.join('\\n- ')}\\nConfigure the Vercel Production environment; secret values are never printed.`,
    );
  }

  return [];
}

if (process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production') {
  validateProductionApiEnvironment();
  process.stdout.write('[irp-api] Production environment preflight: PASS (values redacted).\\n');
}
