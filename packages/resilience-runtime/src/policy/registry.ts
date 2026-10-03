/**
 * Policy Registry with versioning and domain-specific conflict resolution (Phase 4).
 * Canonical policy store with semantic versioning, rollback, and domain strategies.
 */

import { deepFreeze, nextId, nowIso } from '../domain/ids.js';
import type { PolicySnapshot, ResiliencePolicy, PolicyEvaluation } from '../domain/types.js';
import { defaultPolicy } from '../context/context.js';

export type PolicyDomain = 
  | 'security'
  | 'routing'
  | 'dns'
  | 'gateway'
  | 'tunnel'
  | 'connectivity'
  | 'failover'
  | 'global';

export interface PolicyVersion {
  readonly version: string; // semver
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

const DOMAIN_RESOLUTIONS: Readonly<Record<PolicyDomain, PolicyConflictResolution>> = Object.freeze({
  security: { domain: 'security', strategy: 'security-strict' },
  routing: { domain: 'routing', strategy: 'hierarchical' },
  dns: { domain: 'dns', strategy: 'union' },
  gateway: { domain: 'gateway', strategy: 'hierarchical' },
  tunnel: { domain: 'tunnel', strategy: 'intersection' },
  connectivity: { domain: 'connectivity', strategy: 'union' },
  failover: { domain: 'failover', strategy: 'intersection' },
  global: { domain: 'global', strategy: 'hierarchical' },
});

export interface PolicyRegistryOptions {
  readonly initialPolicy?: ResiliencePolicy;
  readonly domainResolutions?: Partial<Record<PolicyDomain, PolicyConflictResolution>>;
}

/**
 * Canonical policy registry with versioning, rollback, and domain-specific conflict resolution.
 */
export class PolicyRegistry {
  private versions: Map<string, PolicyVersion> = new Map();
  private currentVersion: string;
  private readonly domainResolutions: Record<PolicyDomain, PolicyConflictResolution>;

  constructor(options: PolicyRegistryOptions = {}) {
    const initial = options.initialPolicy ?? defaultPolicy('safe');
    const v0 = this.createVersion('0.1.0', initial, 'system', 'Initial default policy');
    this.versions.set(v0.version, v0);
    this.currentVersion = v0.version;
    
    this.domainResolutions = { ...DOMAIN_RESOLUTIONS, ...options.domainResolutions } as Record<PolicyDomain, PolicyConflictResolution>;
  }

  private createVersion(
    version: string,
    policy: ResiliencePolicy,
    createdBy: string,
    description?: string,
    parentVersion?: string,
  ): PolicyVersion {
    const base = {
      version,
      policy: deepFreeze({ ...policy }),
      createdAt: nowIso(),
      createdBy,
    } as const;
    return Object.freeze({
      ...base,
      ...(description !== undefined ? { description } : {}),
      ...(parentVersion !== undefined ? { parentVersion } : {}),
    });
  }

  private bumpVersion(current: string, level: 'major' | 'minor' | 'patch'): string {
    const parts = current.split('.');
    const major = Number(parts[0] ?? 0);
    const minor = Number(parts[1] ?? 0);
    const patch = Number(parts[2] ?? 0);
    switch (level) {
      case 'major': return `${major + 1}.0.0`;
      case 'minor': return `${major}.${minor + 1}.0`;
      case 'patch': return `${major}.${minor}.${patch + 1}`;
      default: return current; // exhaustive check
    }
  }

  /** Get the current policy snapshot. */
  getCurrent(): PolicySnapshot {
    const version = this.versions.get(this.currentVersion)!;
    return {
      id: nextId('policy'),
      schemaVersion: 1,
      createdAt: version.createdAt,
      correlationId: 'policy-registry',
      source: 'policy-registry',
      metadata: {},
      policy: version.policy,
    };
  }

  /** Get a specific version by semver string. */
  getVersion(version: string): PolicyVersion | undefined {
    return this.versions.get(version);
  }

  /** List all versions in chronological order. */
  listVersions(): readonly PolicyVersion[] {
    return Object.freeze([...this.versions.values()].sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    ));
  }

  /** Get the current version string. */
  getCurrentVersion(): string {
    return this.currentVersion;
  }

  /**
   * Propose a new policy version.
   * Returns the new version string if successful.
   */
  propose(
    policy: ResiliencePolicy,
    createdBy: string,
    description?: string,
    level: 'major' | 'minor' | 'patch' = 'minor',
  ): string {
    const newVersion = this.bumpVersion(this.currentVersion, level);
    const version = this.createVersion(newVersion, policy, createdBy, description, this.currentVersion);
    this.versions.set(newVersion, version);
    this.currentVersion = newVersion;
    return newVersion;
  }

  /** Rollback to a previous version. */
  rollback(targetVersion: string, rolledBackBy: string): boolean {
    if (!this.versions.has(targetVersion)) return false;
    this.currentVersion = targetVersion;
    // Record rollback as a new version entry for audit trail
    const rollbackVersion = this.bumpVersion(this.currentVersion, 'patch') + '-rollback';
    const rollback = this.createVersion(
      rollbackVersion,
      this.versions.get(targetVersion)!.policy,
      rolledBackBy,
      `Rollback to ${targetVersion}`,
      targetVersion,
    );
    this.versions.set(rollbackVersion, rollback);
    this.currentVersion = targetVersion;
    return true;
  }

  /**
   * Resolve policy conflicts for a specific domain.
   * Returns the merged policy and any conflicts detected.
   */
  resolveConflict(
    policyA: ResiliencePolicy,
    policyB: ResiliencePolicy,
    domain: PolicyDomain,
  ): { merged: ResiliencePolicy; conflicts: string[] } {
    const resolution = this.domainResolutions[domain] ?? DOMAIN_RESOLUTIONS[domain];
    const strategy = resolution.strategy;
    const conflicts: string[] = [];

    // Compute merged values
    let mergedAllowedActions = policyA.allowedActions;
    if (policyA.allowedActions.length !== policyB.allowedActions.length ||
        !policyA.allowedActions.every((v, i) => v === policyB.allowedActions[i])) {
      conflicts.push('allowedActions differ');
      mergedAllowedActions = this.mergeArrays(policyA.allowedActions, policyB.allowedActions, strategy);
    }

    let mergedDeniedActions = policyA.deniedActions;
    if (policyA.deniedActions.length !== policyB.deniedActions.length ||
        !policyA.deniedActions.every((v, i) => v === policyB.deniedActions[i])) {
      conflicts.push('deniedActions differ');
      mergedDeniedActions = this.mergeArrays(policyA.deniedActions, policyB.deniedActions, strategy);
    }

    let mergedCapabilityRequirements = policyA.capabilityRequirements;
    if (JSON.stringify(policyA.capabilityRequirements) !== JSON.stringify(policyB.capabilityRequirements)) {
      conflicts.push('capabilityRequirements differ');
      mergedCapabilityRequirements = this.mergeCapabilityRequirements(
        policyA.capabilityRequirements,
        policyB.capabilityRequirements,
        strategy,
      );
    }

    // Merge scalar fields
    const mergedConfidenceThreshold = policyA.confidenceThreshold === policyB.confidenceThreshold
      ? policyA.confidenceThreshold
      : this.mergeScalar(policyA.confidenceThreshold, policyB.confidenceThreshold, strategy);
    const mergedActionBudget = policyA.actionBudget === policyB.actionBudget
      ? policyA.actionBudget
      : this.mergeScalar(policyA.actionBudget, policyB.actionBudget, strategy);
    const mergedMaxConcurrentActions = policyA.maxConcurrentActions === policyB.maxConcurrentActions
      ? policyA.maxConcurrentActions
      : this.mergeScalar(policyA.maxConcurrentActions, policyB.maxConcurrentActions, strategy);
    const mergedTelemetryFreshnessMs = policyA.telemetryFreshnessMs === policyB.telemetryFreshnessMs
      ? policyA.telemetryFreshnessMs
      : this.mergeScalar(policyA.telemetryFreshnessMs, policyB.telemetryFreshnessMs, strategy);
    const mergedSimulationOnly = policyA.simulationOnly === policyB.simulationOnly
      ? policyA.simulationOnly
      : this.mergeScalar(policyA.simulationOnly, policyB.simulationOnly, strategy);
    const mergedFailClosed = policyA.failClosed === policyB.failClosed
      ? policyA.failClosed
      : this.mergeScalar(policyA.failClosed, policyB.failClosed, strategy);
    const mergedManualOverride = policyA.manualOverride === policyB.manualOverride
      ? policyA.manualOverride
      : this.mergeScalar(policyA.manualOverride, policyB.manualOverride, strategy);

    const merged = (() => {
      const obj = Object.create(null) as ResiliencePolicy;
      Object.defineProperty(obj, 'allowedActions', { value: mergedAllowedActions, writable: false, enumerable: true, configurable: false });
      Object.defineProperty(obj, 'deniedActions', { value: mergedDeniedActions, writable: false, enumerable: true, configurable: false });
      Object.defineProperty(obj, 'capabilityRequirements', { value: mergedCapabilityRequirements as Readonly<Record<string, readonly string[]>>, writable: false, enumerable: true, configurable: false });
      Object.defineProperty(obj, 'securityConstraints', { value: policyA.securityConstraints, writable: false, enumerable: true, configurable: false });
      Object.defineProperty(obj, 'actionBudget', { value: mergedActionBudget, writable: false, enumerable: true, configurable: false });
      Object.defineProperty(obj, 'maxConcurrentActions', { value: mergedMaxConcurrentActions, writable: false, enumerable: true, configurable: false });
      Object.defineProperty(obj, 'confidenceThreshold', { value: mergedConfidenceThreshold, writable: false, enumerable: true, configurable: false });
      Object.defineProperty(obj, 'telemetryFreshnessMs', { value: mergedTelemetryFreshnessMs, writable: false, enumerable: true, configurable: false });
      Object.defineProperty(obj, 'simulationOnly', { value: mergedSimulationOnly as boolean, writable: false, enumerable: true, configurable: false });
      Object.defineProperty(obj, 'failClosed', { value: mergedFailClosed as boolean, writable: false, enumerable: true, configurable: false });
      Object.defineProperty(obj, 'manualOverride', { value: mergedManualOverride as boolean | undefined, writable: false, enumerable: true, configurable: false });
      return Object.freeze(obj);
    })();

    return { merged: deepFreeze(merged), conflicts: conflicts.slice() };
  }

  private mergeArrays<T>(
    a: readonly T[],
    b: readonly T[],
    strategy: 'union' | 'intersection' | 'hierarchical' | 'security-strict',
  ): readonly T[] {
    if (strategy === 'intersection' || strategy === 'security-strict') {
      return a.filter((x) => b.includes(x));
    }
    if (strategy === 'union') {
      return Array.from(new Set([...a, ...b]));
    }
    // hierarchical: first wins
    return a;
  }

  private mergeCapabilityRequirements(
    a: Readonly<Record<string, readonly string[]>>,
    b: Readonly<Record<string, readonly string[]>>,
    strategy: 'union' | 'intersection' | 'hierarchical' | 'security-strict',
  ): Readonly<Record<string, readonly string[]>> {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    const entries = keys.map((key) => {
      const av = a[key] ?? [];
      const bv = b[key] ?? [];
      const merged = this.mergeArrays<string>(av, bv, strategy);
      return [key, merged] as const;
    });
    return Object.freeze(Object.fromEntries(entries));
  }

  private mergeScalar(
    a: unknown,
    b: unknown,
    strategy: 'union' | 'intersection' | 'hierarchical' | 'security-strict',
  ): unknown {
    if (strategy === 'intersection' || strategy === 'security-strict') {
      if (typeof a === 'number' && typeof b === 'number') return Math.max(a, b);
      if (typeof a === 'boolean' && typeof b === 'boolean') return a && b;
    }
    if (strategy === 'union') {
      if (typeof a === 'number' && typeof b === 'number') return Math.min(a, b);
      if (typeof a === 'boolean' && typeof b === 'boolean') return a || b;
    }
    // hierarchical: first wins
    return a ?? b;
  }

  /** Get the conflict resolution strategy for a domain. */
  getDomainResolution(domain: PolicyDomain): PolicyConflictResolution {
    return this.domainResolutions[domain] ?? DOMAIN_RESOLUTIONS[domain];
  }
}

/** Global singleton instance for the canonical policy registry. */
let globalPolicyRegistry: PolicyRegistry | null = null;

/** Get or create the global policy registry. */
export const getPolicyRegistry = (options?: PolicyRegistryOptions): PolicyRegistry => {
  if (!globalPolicyRegistry) {
    globalPolicyRegistry = new PolicyRegistry(options);
  }
  return globalPolicyRegistry;
}

/** Reset the global registry (for testing). */
export const resetPolicyRegistry = (): void => {
  globalPolicyRegistry = null;
}