/**
 * Policy Registry with versioning and domain-specific conflict resolution (Phase 4).
 * Canonical policy store with semantic versioning, rollback, and domain strategies.
 */
import type { PolicySnapshot, ResiliencePolicy } from '../domain/types.js';
export type PolicyDomain = 'security' | 'routing' | 'dns' | 'gateway' | 'tunnel' | 'connectivity' | 'failover' | 'global';
export interface PolicyVersion {
    readonly version: string;
    readonly policy: ResiliencePolicy;
    readonly createdAt: string;
    readonly createdBy: string;
    readonly description?: string;
    readonly parentVersion?: string;
}
export interface PolicyConflictResolution {
    readonly domain: PolicyDomain;
    readonly strategy: 'union' | 'intersection' | 'hierarchical' | 'security-strict';
}
export interface PolicyRegistryOptions {
    readonly initialPolicy?: ResiliencePolicy;
    readonly domainResolutions?: Partial<Record<PolicyDomain, PolicyConflictResolution>>;
}
/**
 * Canonical policy registry with versioning, rollback, and domain-specific conflict resolution.
 */
export declare class PolicyRegistry {
    private versions;
    private currentVersion;
    private readonly domainResolutions;
    constructor(options?: PolicyRegistryOptions);
    private createVersion;
    private bumpVersion;
    /** Get the current policy snapshot. */
    getCurrent(): PolicySnapshot;
    /** Get a specific version by semver string. */
    getVersion(version: string): PolicyVersion | undefined;
    /** List all versions in chronological order. */
    listVersions(): readonly PolicyVersion[];
    /** Get the current version string. */
    getCurrentVersion(): string;
    /**
     * Propose a new policy version.
     * Returns the new version string if successful.
     */
    propose(policy: ResiliencePolicy, createdBy: string, description?: string, level?: 'major' | 'minor' | 'patch'): string;
    /** Rollback to a previous version. */
    rollback(targetVersion: string, rolledBackBy: string): boolean;
    /**
     * Resolve policy conflicts for a specific domain.
     * Returns the merged policy and any conflicts detected.
     */
    resolveConflict(policyA: ResiliencePolicy, policyB: ResiliencePolicy, domain: PolicyDomain): {
        merged: ResiliencePolicy;
        conflicts: string[];
    };
    private mergeArrays;
    private mergeCapabilityRequirements;
    private mergeScalar;
    /** Get the conflict resolution strategy for a domain. */
    getDomainResolution(domain: PolicyDomain): PolicyConflictResolution;
}
//# sourceMappingURL=registry.d.ts.map