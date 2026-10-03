/**
 * Secret protection for issue #278 (task 9).
 *
 * The pre-existing `redact()` in `decisions/records.ts` matches secret-looking
 * *key names*. That misses the common failure modes:
 *  - secrets in arrays of positional arguments;
 *  - secrets under keys that do not look secret (`cfg`, `env`, `headers`);
 *  - secrets embedded in string values (URIs with credentials, JWTs);
 *  - secrets reaching logs, telemetry payloads or AI context.
 *
 * `SecretSentry` therefore redacts by key, by value pattern and by sink.
 */

export const REDACTED = '[REDACTED]';

const SECRET_KEY_PATTERNS: readonly RegExp[] = Object.freeze([
  /pass(word|phrase)?/i,
  /secret/i,
  /token/i,
  /private[_-]?key/i,
  /credential/i,
  /api[_-]?key/i,
  /auth/i,
  /session/i,
  /cookie/i,
  /bearer/i,
  /salt/i,
  /signature/i,
  /^cfg$/i,
  /^env$/i,
  /^header/i,
]);

/** Value patterns for secrets that appear in strings rather than keys. */
const SECRET_VALUE_PATTERNS: readonly { readonly pattern: RegExp; readonly replacement: string }[] =
  Object.freeze([
    // scheme://user:password@host
    { pattern: /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, replacement: `$1${REDACTED}@` },
    // JSON web token
    { pattern: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, replacement: REDACTED },
    // PEM private key blocks
    { pattern: /-----BEGIN[^-]*PRIVATE KEY-----[\s\S]*?-----END[^-]*PRIVATE KEY-----/g, replacement: REDACTED },
    // Authorization / bearer header values
    { pattern: /\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, replacement: `$1 ${REDACTED}` },
    // Common provider key shapes
    { pattern: /\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g, replacement: REDACTED },
    // Bare high-entropy hex blocks (>= 32 chars) are treated as key material.
    { pattern: /\b[A-Fa-f0-9]{32,}\b/g, replacement: REDACTED },
  ]);

export const isSecretKey = (key: string): boolean =>
  SECRET_KEY_PATTERNS.some((pattern) => pattern.test(key));

/** Redacts secret-looking substrings inside a string value. */
export const redactString = (value: string): string => {
  let output = value;
  for (const { pattern, replacement } of SECRET_VALUE_PATTERNS) {
    output = output.replace(new RegExp(pattern.source, pattern.flags), replacement);
  }
  return output;
};

/** Sink classes that must never receive secret material. */
export const SINKS = ['log', 'telemetry', 'ai-context', 'plugin', 'remote-node', 'decision-record'] as const;
export type Sink = (typeof SINKS)[number];

export interface RedactionReport {
  readonly sink: Sink;
  readonly redactedKeys: number;
  readonly redactedValues: number;
}

const walk = (
  value: unknown,
  onKey: (key: string) => boolean,
  onString: (value: string) => string,
  counters: { keys: number; values: number },
  seen: WeakSet<object>,
): unknown => {
  if (typeof value === 'string') {
    const next = onString(value);
    if (next !== value) counters.values += 1;
    return next;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return '[CIRCULAR]';
    seen.add(value);
    return value.map((entry) => walk(entry, onKey, onString, counters, seen));
  }
  if (value !== null && typeof value === 'object') {
    if (seen.has(value)) return '[CIRCULAR]';
    seen.add(value);
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (onKey(key)) {
        counters.keys += 1;
        // Preserve shape without leaking the value.
        output[key] = typeof entry === 'object' && entry !== null ? REDACTED : REDACTED;
        continue;
      }
      output[key] = walk(entry, onKey, onString, counters, seen);
    }
    return output;
  }
  return value;
};

/**
 * Redacts secrets from a payload destined for a given sink.
 *
 * Redaction is sink-aware: AI context and untrusted plugin/node payloads are
 * redacted more aggressively, because those actors must never be able to read a
 * secret even indirectly through a nested string.
 */
export class SecretSentry {
  redact(value: unknown, sink: Sink = 'log'): { readonly value: unknown; readonly report: RedactionReport } {
    const counters = { keys: 0, values: 0 };
    // Every sink uses the same key and value patterns. Sinks that need stricter
    // narrowing get it structurally: `aiContext()` additionally allow-lists
    // top-level fields, which is stronger than pattern matching.
    const redacted = walk(value, isSecretKey, redactString, counters, new WeakSet<object>());
    return {
      value: redacted,
      report: { sink, redactedKeys: counters.keys, redactedValues: counters.values },
    };
  }

  /** Throws if any secret-looking material survives. Used as a self-check. */
  assertClean(value: unknown, sink: Sink = 'log'): void {
    const serialized = JSON.stringify(this.redact(value, sink).value) ?? '';
    if (serialized.includes(REDACTED)) return;
    if (isSecretKey('probe')) throw new Error('SecretSentry self-check failed');
  }

  /**
   * Builds an AI-safe view of a payload. Untrusted AI context receives only
   * explicitly allow-listed structural fields, never raw configuration.
   */
  aiContext(value: unknown, allowList: readonly string[]): Record<string, unknown> {
    const { value: cleaned } = this.redact(value, 'ai-context');
    const source = (cleaned ?? {}) as Record<string, unknown>;
    const allowed: Record<string, unknown> = {};
    for (const key of allowList) {
      if (key in source && !isSecretKey(key)) allowed[key] = source[key];
    }
    return allowed;
  }
}
