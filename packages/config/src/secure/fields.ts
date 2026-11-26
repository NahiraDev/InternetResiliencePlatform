/**
 * Inventory of the runtime settings the local configuration portal manages.
 *
 * Validation messages are static strings by contract: they must never contain any part of the value
 * being validated, because they are returned to the browser and printed by the runtime loader.
 */
import { isIP } from 'node:net';

export type ConfigSection = 'database' | 'authentication' | 'email' | 'application';

export interface ConfigField {
  readonly name: string;
  readonly section: ConfigSection;
  readonly label: string;
  readonly purpose: string;
  readonly rule: string;
  readonly required: boolean;
  readonly sensitive: boolean;
  /** Returns a static, value-free problem description, or undefined when acceptable. */
  readonly check: (value: string) => string | undefined;
}

const MAX_LENGTH = 4096;

const parseUrl = (value: string): URL | undefined => {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
};

const postgresUrl = (value: string) => {
  const url = parseUrl(value);
  if (!url || !['postgres:', 'postgresql:'].includes(url.protocol))
    return 'Must be a postgres:// or postgresql:// connection URL.';
  if (!url.hostname || !url.username || url.pathname.length < 2)
    return 'Must include a user, a host and a database name.';
  return undefined;
};

const signingKey = (value: string) => {
  if (value.length < 32) return 'Must be at least 32 characters.';
  if (/\s/.test(value)) return 'Must not contain whitespace.';
  if (new Set(value).size < 10) return 'Is too repetitive; use a randomly generated value.';
  if (value.startsWith('development-secret'))
    return 'Is the built-in development default; use a randomly generated value.';
  return undefined;
};

const httpsUrl = (value: string) => {
  const url = parseUrl(value);
  if (!url || !value.startsWith('https://')) return 'Must be an absolute https:// URL.';
  if (url.username || url.password) return 'Must not embed a user name or password.';
  return undefined;
};

const publicBaseUrl = (value: string) =>
  httpsUrl(value) ??
  (value.includes('?') || value.includes('#')
    ? 'Must not contain a query string or fragment.'
    : undefined);

const integer = (min: number, max: number) => (value: string) =>
  /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max
    ? undefined
    : `Must be a whole number from ${min} to ${max}.`;

const oneOf =
  (...allowed: string[]) =>
  (value: string) =>
    allowed.includes(value) ? undefined : `Must be one of: ${allowed.join(', ')}.`;

const list = (value: string) => value.split(',').map((entry) => entry.trim());

const emailList = (value: string) =>
  list(value).every((entry) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry))
    ? undefined
    : 'Must be a comma-separated list of email addresses.';

const originList = (value: string) =>
  list(value).every((entry) => {
    const url = parseUrl(entry);
    return !!url && ['http:', 'https:'].includes(url.protocol) && url.origin === entry;
  })
    ? undefined
    : 'Must be a comma-separated list of origins such as https://host (no path or trailing slash).';

/** Same grammar as apps/api/src/security/trust-proxy.ts, minus the spoofable "true". */
const trustProxy = (value: string) => {
  if (value === 'false') return undefined;
  if (/^\d+$/.test(value)) return integer(1, 32)(value);
  const ok = list(value).every((entry) => {
    if (['loopback', 'linklocal', 'uniquelocal'].includes(entry)) return true;
    const [address = '', prefix, ...rest] = entry.split('/');
    const family = isIP(address);
    // The runtime parser rejects zone ids and dotted IPv6 forms.
    if (!family || rest.length || (family === 6 && /[.%]/.test(address))) return false;
    return prefix === undefined || !integer(0, family === 4 ? 32 : 128)(prefix);
  });
  return ok
    ? undefined
    : 'Must be false, a hop count, or a list of IPs/CIDRs/loopback/linklocal/uniquelocal.';
};

const host = (value: string) =>
  isIP(value) || /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/i.test(value)
    ? undefined
    : 'Must be an IP address or host name.';

const plain = (value: string) => (/\s/.test(value) ? 'Must not contain whitespace.' : undefined);
const anyText = () => undefined;

type Spec = Omit<ConfigField, 'required' | 'sensitive' | 'check'> & {
  required?: boolean;
  sensitive?: boolean;
  check: ConfigField['check'];
};

const field = (spec: Spec): ConfigField =>
  Object.freeze({
    ...spec,
    required: spec.required ?? false,
    sensitive: spec.sensitive ?? false,
    check: (value: string) => {
      if (!value) return 'A value is required.';
      if (value.length > MAX_LENGTH) return `Must be at most ${MAX_LENGTH} characters.`;
      // eslint-disable-next-line no-control-regex
      if (/[\u0000-\u001f\u007f]/.test(value))
        return 'Must be a single line without control characters.';
      if (value !== value.trim()) return 'Must not start or end with whitespace.';
      return spec.check(value);
    },
  });

export const CONFIG_FIELDS: readonly ConfigField[] = Object.freeze([
  field({
    name: 'DATABASE_URL',
    section: 'database',
    label: 'PostgreSQL connection URL',
    purpose: 'Durable storage for identities, sessions, devices, settings and history.',
    rule: 'postgresql://user:password@host:port/database (percent-encode special characters).',
    required: true,
    sensitive: true,
    check: postgresUrl,
  }),
  field({
    name: 'IRP_DB_POOL_MAX',
    section: 'database',
    label: 'Database pool size',
    purpose: 'Maximum pooled connections for the identity store (default 5).',
    rule: 'Whole number from 1 to 100.',
    check: integer(1, 100),
  }),
  field({
    name: 'IRP_DB_STATEMENT_TIMEOUT_MS',
    section: 'database',
    label: 'Statement timeout (ms)',
    purpose: 'Server-side statement timeout (default 15000; 0 omits it).',
    rule: 'Whole number from 0 to 600000.',
    check: integer(0, 600_000),
  }),
  field({
    name: 'IRP_INTENT_DB_HOST',
    section: 'database',
    label: 'Intent store host',
    purpose: 'Enables the optional PostgreSQL intent store. Leave unset to keep it off.',
    rule: 'IP address or host name.',
    check: host,
  }),
  field({
    name: 'IRP_INTENT_DB_PORT',
    section: 'database',
    label: 'Intent store port',
    purpose: 'Port of the intent store (default 5432).',
    rule: 'Whole number from 1 to 65535.',
    check: integer(1, 65_535),
  }),
  field({
    name: 'IRP_INTENT_DB_NAME',
    section: 'database',
    label: 'Intent store database',
    purpose: 'Database name of the intent store (default irp).',
    rule: 'No whitespace.',
    check: plain,
  }),
  field({
    name: 'IRP_INTENT_DB_USER',
    section: 'database',
    label: 'Intent store user',
    purpose: 'User of the intent store (default irp).',
    rule: 'No whitespace.',
    check: plain,
  }),
  field({
    name: 'IRP_INTENT_DB_PASSWORD',
    section: 'database',
    label: 'Intent store password',
    purpose: 'Password of the intent store.',
    rule: 'Single line.',
    sensitive: true,
    check: anyText,
  }),
  field({
    name: 'IRP_INTENT_DB_SSL',
    section: 'database',
    label: 'Intent store TLS',
    purpose: 'Use TLS for the intent store (default false).',
    rule: 'true or false.',
    check: oneOf('true', 'false'),
  }),
  field({
    name: 'IRP_INTENT_DB_MAX',
    section: 'database',
    label: 'Intent store pool size',
    purpose: 'Maximum intent store connections (default 10).',
    rule: 'Whole number from 1 to 100.',
    check: integer(1, 100),
  }),
  field({
    name: 'JWT_SECRET',
    section: 'authentication',
    label: 'JWT signing secret',
    purpose: 'Signs API access tokens. Changing it invalidates issued tokens.',
    rule: 'At least 32 random characters, no whitespace.',
    required: true,
    sensitive: true,
    check: signingKey,
  }),
  field({
    name: 'REMOTE_CLIENT_CREDENTIAL_KEY',
    section: 'authentication',
    label: 'Remote client credential key',
    purpose: 'Hashes enrolled device credentials. Changing it invalidates them.',
    rule: 'At least 32 random characters, different from the other two keys.',
    required: true,
    sensitive: true,
    check: signingKey,
  }),
  field({
    name: 'REMOTE_CLIENT_REFRESH_KEY',
    section: 'authentication',
    label: 'Remote client refresh key',
    purpose: 'Hashes device refresh tokens. Changing it invalidates them.',
    rule: 'At least 32 random characters, different from the other two keys.',
    required: true,
    sensitive: true,
    check: signingKey,
  }),
  field({
    name: 'IRP_BOOTSTRAP_ADMIN_EMAILS',
    section: 'authentication',
    label: 'Bootstrap administrator emails',
    purpose: 'These addresses receive platform_admin when they verify their email.',
    rule: 'Comma-separated email addresses.',
    check: emailList,
  }),
  field({
    name: 'IRP_EMAIL_WEBHOOK_URL',
    section: 'email',
    label: 'Email relay webhook URL',
    purpose: 'Verification and password reset emails are POSTed to this relay.',
    rule: 'Absolute https:// URL.',
    required: true,
    sensitive: true,
    check: httpsUrl,
  }),
  field({
    name: 'IRP_EMAIL_WEBHOOK_TOKEN',
    section: 'email',
    label: 'Email relay bearer token',
    purpose: 'Sent as the Authorization bearer token to the relay.',
    rule: 'No whitespace.',
    sensitive: true,
    check: plain,
  }),
  field({
    name: 'IRP_PUBLIC_BASE_URL',
    section: 'application',
    label: 'Public base URL',
    purpose: 'Link target used in verification and password reset emails.',
    rule: 'Absolute https:// URL without query string or fragment.',
    required: true,
    check: publicBaseUrl,
  }),
  field({
    name: 'API_HOST',
    section: 'application',
    label: 'API listen address',
    purpose: 'Address the API binds to. The secure start command defaults to 127.0.0.1.',
    rule: 'IP address or host name.',
    check: host,
  }),
  field({
    name: 'API_PORT',
    section: 'application',
    label: 'API port',
    purpose: 'Port the API listens on (default 8080).',
    rule: 'Whole number from 1 to 65535.',
    check: integer(1, 65_535),
  }),
  field({
    name: 'LOG_LEVEL',
    section: 'application',
    label: 'Log level',
    purpose: 'API log verbosity (default info).',
    rule: 'debug, info, warn, error or fatal.',
    check: oneOf('debug', 'info', 'warn', 'error', 'fatal'),
  }),
  field({
    name: 'CORS_ALLOWED_ORIGINS',
    section: 'application',
    label: 'Allowed CORS origins',
    purpose: 'Browser origins allowed to call the API. Unset disables CORS.',
    rule: 'Comma-separated origins.',
    check: originList,
  }),
  field({
    name: 'IRP_TRUST_PROXY',
    section: 'application',
    label: 'Trusted proxies',
    purpose: 'Which reverse proxies may set the client IP (default none).',
    rule: 'false, a hop count, or IPs/CIDRs/loopback/linklocal/uniquelocal.',
    check: trustProxy,
  }),
  field({
    name: 'IRP_RETENTION_GRACE_DAYS',
    section: 'application',
    label: 'Expired data grace (days)',
    purpose: 'How long expired sessions and tokens are kept (default 7).',
    rule: 'Whole number from 1 to 3650.',
    check: integer(1, 3650),
  }),
  field({
    name: 'IRP_AUDIT_RETENTION_DAYS',
    section: 'application',
    label: 'Audit log retention (days)',
    purpose: 'Unset keeps audit logs forever.',
    rule: 'Whole number from 1 to 36500.',
    check: integer(1, 36_500),
  }),
  field({
    name: 'IRP_RETENTION_INTERVAL_MINUTES',
    section: 'application',
    label: 'Retention job interval (minutes)',
    purpose: 'How often expired data is purged (default 60; 0 disables).',
    rule: 'Whole number from 0 to 10080.',
    check: integer(0, 10_080),
  }),
]);

const BY_NAME = new Map(CONFIG_FIELDS.map((entry) => [entry.name, entry]));
export const findField = (name: string): ConfigField | undefined => BY_NAME.get(name);

const SIGNING_KEYS = ['JWT_SECRET', 'REMOTE_CLIENT_CREDENTIAL_KEY', 'REMOTE_CLIENT_REFRESH_KEY'];

/** Per-field and cross-field problems for the values that are present. Messages never contain values. */
export const findProblems = (
  values: Readonly<Record<string, string | undefined>>,
): Record<string, string> => {
  const problems: Record<string, string> = {};
  for (const entry of CONFIG_FIELDS) {
    const value = values[entry.name];
    if (value === undefined) continue;
    const problem = entry.check(value);
    if (problem) problems[entry.name] = problem;
  }
  for (const name of SIGNING_KEYS) {
    const value = values[name];
    if (value && SIGNING_KEYS.some((other) => other !== name && values[other] === value))
      problems[name] ??= 'Must differ from the other signing keys.';
  }
  return problems;
};
