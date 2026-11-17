/**
 * Resolves the Fastify `trustProxy` setting from `IRP_TRUST_PROXY`.
 *
 * Behind a load balancer every request arrives from the proxy's address, so rate limits and
 * lockouts keyed on `request.ip` would throttle all clients together (and let one client lock
 * everyone out). Trusting `X-Forwarded-For` blindly is worse: any client could spoof its IP and
 * dodge limits. The safe default is therefore `false` (use the socket address); operators opt in
 * with the real topology:
 *
 *   IRP_TRUST_PROXY=1                  trust exactly one proxy hop (typical: a single LB)
 *   IRP_TRUST_PROXY=10.0.0.0/8,127.0.0.1   trust only these proxy addresses / CIDRs
 *   IRP_TRUST_PROXY=loopback,linklocal,uniquelocal   Fastify/proxy-addr named ranges
 *   IRP_TRUST_PROXY=true               trust every hop (spoofable; refused in production)
 *
 * A malformed value throws at startup instead of silently falling back.
 */
export type TrustProxySetting = boolean | number | string[];

const NAMED_RANGES = new Set(['loopback', 'linklocal', 'uniquelocal']);
const IPV4_CIDR = /^(\d{1,3}\.){3}\d{1,3}(\/(\d|[12]\d|3[0-2]))?$/;
const IPV6_CIDR = /^[0-9a-f:]+(\/(\d{1,2}|1[01]\d|12[0-8]))?$/i;

const validEntry = (entry: string): boolean => {
  if (NAMED_RANGES.has(entry)) return true;
  if (IPV4_CIDR.test(entry)) {
    return entry
      .split('/')[0]!
      .split('.')
      .every((octet) => Number(octet) <= 255);
  }
  return entry.includes(':') && IPV6_CIDR.test(entry);
};

export const resolveTrustProxy = (
  env: Record<string, string | undefined> = process.env,
): TrustProxySetting => {
  const raw = env.IRP_TRUST_PROXY?.trim();
  if (raw === undefined || raw === '' || raw.toLowerCase() === 'false') return false;

  if (raw.toLowerCase() === 'true') {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'IRP_TRUST_PROXY=true trusts every X-Forwarded-For hop and lets clients spoof their IP; ' +
          'set a hop count (e.g. 1) or the proxy CIDRs in production.',
      );
    }
    return true;
  }

  if (/^\d+$/.test(raw)) {
    const hops = Number(raw);
    if (hops < 1 || hops > 32) {
      throw new Error(`IRP_TRUST_PROXY hop count must be between 1 and 32 (got ${raw}).`);
    }
    return hops;
  }

  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  const invalid = entries.filter((entry) => !validEntry(entry));
  if (entries.length === 0 || invalid.length > 0) {
    throw new Error(
      `IRP_TRUST_PROXY is invalid (${invalid.join(', ') || raw}); use a hop count, ` +
        'a comma-separated list of IPs/CIDRs, or loopback/linklocal/uniquelocal.',
    );
  }
  return entries;
};

/**
 * Maps the resolved setting to Fastify's typed `trustProxy` option. A hop count becomes a
 * trust function (proxy-addr passes the zero-based hop index), since the option's typings
 * accept a function but not a bare number.
 */
export const toFastifyTrustProxy = (
  setting: TrustProxySetting,
): boolean | string[] | ((address: string, hop: number) => boolean) =>
  typeof setting === 'number' ? (_address, hop) => hop < setting : setting;
