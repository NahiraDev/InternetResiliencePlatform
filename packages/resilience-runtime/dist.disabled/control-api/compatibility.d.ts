/**
 * Phase 140 — API Compatibility, Migration & Deprecation Framework.
 *
 * Classifies schema changes as breaking or compatible, enforces deprecation
 * windows (announce → sunset with a minimum notice period), and applies
 * ordered payload migrations between versions with verifiable round-trips.
 */
import type { ObjectSchema } from './versioned-api.js';
export interface SchemaChange {
    readonly field: string;
    readonly kind: 'removed' | 'added-required' | 'added-optional' | 'type-changed' | 'tightened' | 'loosened' | 'enum-narrowed' | 'enum-widened';
    readonly breaking: boolean;
}
export declare const diffSchemas: (before: ObjectSchema, after: ObjectSchema) => readonly SchemaChange[];
export type VersionBump = 'major' | 'minor' | 'patch';
/** The minimum version bump permitted for a set of changes. */
export declare const requiredBump: (changes: readonly SchemaChange[]) => VersionBump;
export declare const checkVersionBump: (from: string, to: string, changes: readonly SchemaChange[]) => {
    readonly ok: boolean;
    readonly required: VersionBump;
    readonly reason?: string;
};
export interface Deprecation {
    readonly target: string;
    readonly announcedAtMs: number;
    readonly sunsetAtMs: number;
    readonly replacement?: string;
}
export type DeprecationStatus = 'active' | 'deprecated' | 'sunset';
export declare class DeprecationPolicy {
    private readonly minimumNoticeMs;
    private readonly items;
    constructor(minimumNoticeMs: number);
    announce(d: Deprecation): void;
    status(target: string, nowMs: number): DeprecationStatus;
    /** Headers advertising deprecation to clients (Deprecation / Sunset / Link style). */
    headers(target: string, nowMs: number): Readonly<Record<string, string>>;
    upcoming(nowMs: number, withinMs: number): readonly Deprecation[];
}
export interface PayloadMigration {
    readonly from: string;
    readonly to: string;
    up(payload: Record<string, unknown>): Record<string, unknown>;
    down?(payload: Record<string, unknown>): Record<string, unknown>;
}
export declare class MigrationChain {
    private readonly steps;
    add(m: PayloadMigration): void;
    /** Applies migrations from `from` until `to`; refuses missing steps and cycles. */
    migrate(payload: Record<string, unknown>, from: string, to: string): Record<string, unknown>;
    /** True when up then down reproduces the original for every sample, for each reversible step. */
    verifyRoundTrip(samples: readonly Record<string, unknown>[]): readonly string[];
}
//# sourceMappingURL=compatibility.d.ts.map