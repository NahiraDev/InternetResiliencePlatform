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
export declare const REDACTED = "[REDACTED]";
export declare const isSecretKey: (key: string) => boolean;
/** Redacts secret-looking substrings inside a string value. */
export declare const redactString: (value: string) => string;
/** Sink classes that must never receive secret material. */
export declare const SINKS: readonly ["log", "telemetry", "ai-context", "plugin", "remote-node", "decision-record"];
export type Sink = (typeof SINKS)[number];
export interface RedactionReport {
    readonly sink: Sink;
    readonly redactedKeys: number;
    readonly redactedValues: number;
}
/**
 * Redacts secrets from a payload destined for a given sink.
 *
 * Redaction is sink-aware: AI context and untrusted plugin/node payloads are
 * redacted more aggressively, because those actors must never be able to read a
 * secret even indirectly through a nested string.
 */
export declare class SecretSentry {
    redact(value: unknown, sink?: Sink): {
        readonly value: unknown;
        readonly report: RedactionReport;
    };
    /** Throws if any secret-looking material survives. Used as a self-check. */
    assertClean(value: unknown, sink?: Sink): void;
    /**
     * Builds an AI-safe view of a payload. Untrusted AI context receives only
     * explicitly allow-listed structural fields, never raw configuration.
     */
    aiContext(value: unknown, allowList: readonly string[]): Record<string, unknown>;
}
//# sourceMappingURL=secrets.d.ts.map