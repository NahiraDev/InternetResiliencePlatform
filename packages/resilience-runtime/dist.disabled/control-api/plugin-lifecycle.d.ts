/**
 * Phase 137 — Plugin/Provider Lifecycle Governance.
 *
 * Manifest verification (HMAC-SHA256 over a canonical manifest, constant-time
 * compare), capability allow-listing and a strict lifecycle state machine
 * (registered → verified → active ⇄ suspended → retired). Plugins that fail
 * health repeatedly are quarantined automatically; a plugin can never be
 * granted a capability that was not in its signed manifest or not allowed.
 */
export type PluginState = 'registered' | 'verified' | 'active' | 'suspended' | 'quarantined' | 'retired';
export interface PluginManifest {
    readonly id: string;
    readonly version: string;
    readonly publisher: string;
    readonly capabilities: readonly string[];
    readonly requiresRuntime: string;
    readonly signature: string;
}
export interface PluginRecord {
    readonly manifest: PluginManifest;
    readonly state: PluginState;
    readonly consecutiveFailures: number;
    readonly history: readonly {
        readonly state: PluginState;
        readonly atMs: number;
        readonly reason: string;
    }[];
}
export declare class PluginGovernanceError extends Error {
    readonly code: 'bad-signature' | 'capability-not-allowed' | 'runtime-incompatible' | 'invalid-transition' | 'unknown-plugin' | 'downgrade' | 'untrusted-publisher';
    constructor(code: 'bad-signature' | 'capability-not-allowed' | 'runtime-incompatible' | 'invalid-transition' | 'unknown-plugin' | 'downgrade' | 'untrusted-publisher', message?: string);
}
export declare const signManifest: (m: Omit<PluginManifest, "signature">, key: Buffer | string) => string;
export interface PluginGovernanceOptions {
    readonly publisherKeys: Readonly<Record<string, Buffer | string>>;
    readonly allowedCapabilities: readonly string[];
    readonly runtimeVersion: string;
    readonly failureThreshold?: number;
}
export declare class PluginGovernor {
    private readonly options;
    private readonly plugins;
    constructor(options: PluginGovernanceOptions);
    register(manifest: PluginManifest, nowMs: number): PluginRecord;
    verify(id: string, nowMs: number): PluginRecord;
    activate(id: string, nowMs: number): PluginRecord;
    suspend(id: string, nowMs: number, reason: string): PluginRecord;
    retire(id: string, nowMs: number, reason: string): PluginRecord;
    /** Records a health probe result; repeated failures quarantine an active plugin. */
    reportHealth(id: string, healthy: boolean, nowMs: number): PluginRecord;
    /** The capabilities a plugin may currently exercise: only while active, and only those in its verified manifest. */
    effectiveCapabilities(id: string): readonly string[];
    get(id: string): PluginRecord | undefined;
    list(): readonly PluginRecord[];
    private require;
    private move;
}
//# sourceMappingURL=plugin-lifecycle.d.ts.map