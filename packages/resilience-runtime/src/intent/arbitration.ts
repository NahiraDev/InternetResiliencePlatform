/**
 * Multi-intent arbitration + policy conflict resolution for issue #274 (Section C).
 * Single source of truth for intent arbitration and policy conflict resolution.
 * No new authority — pure functions consumed by the canonical runtime.
 */

import type {
  PolicySnapshot,
  RuntimeContext,
  PolicyEvaluation,
  CandidateAction,
  ActionPlan,
} from '../domain/types.js';
import type { CompiledIntent } from '../domain/types.js';
import { isAutonomyPermitted } from '@irp/core';

export interface IntentConflict {
  readonly intentA: CompiledIntent;
  readonly intentB: CompiledIntent;
  readonly reason: string;
  readonly resolution: 'supersede-a' | 'supersede-b' | 'queue-b' | 'merge';
}

export interface PolicyConflict {
  readonly policyA: PolicySnapshot;
  readonly policyB: PolicySnapshot;
  readonly reason: string;
  readonly resolution: 'union' | 'intersection' | 'hierarchical';
}

/**
 * Arbitrates between multiple compiled intents.
 * Returns the ordered list of intents that may proceed, plus any conflicts.
 */
export const arbitrateIntents = (
  intents: readonly CompiledIntent[],
  now = new Date(),
): { readonly ordered: readonly CompiledIntent[]; readonly conflicts: readonly IntentConflict[] } => {
  // Filter to only effective intents
  const effective = intents.filter((intent) => {
    const from = intent.effectiveFrom ? Date.parse(intent.effectiveFrom) : Number.NEGATIVE_INFINITY;
    const expires = intent.expiresAt ? Date.parse(intent.expiresAt) : Number.POSITIVE_INFINITY;
    const timestamp = now.getTime();
    return timestamp >= from && timestamp < expires;
  });

  // Sort by priority (critical > high > normal > low), then by version (newer wins), then by created time
  const priorityOrder: Record<string, number> = {
    critical: 4,
    high: 3,
    normal: 2,
    low: 1,
  };
  const ordered = effective.slice().sort((a, b) => {
    const pa = priorityOrder[a.priority] ?? 0;
    const pb = priorityOrder[b.priority] ?? 0;
    if (pa !== pb) return pb - pa;
    if (a.version !== b.version) return b.version - a.version;
    return new Date(b.compiledAt).getTime() - new Date(a.compiledAt).getTime();
  });

  // Detect conflicts: overlapping scopes with different desired outcomes
  const conflicts: IntentConflict[] = [];
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      const a = ordered[i]!;
      const b = ordered[j]!;
      if (scopesOverlap(a, b) && a.desiredOutcome !== b.desiredOutcome) {
        // Higher priority supersedes; if same priority, newer version supersedes
        const resolution = a.priority === b.priority
          ? (a.version > b.version ? 'supersede-b' : 'supersede-a')
          : ((priorityOrder[a.priority] ?? 0) > (priorityOrder[b.priority] ?? 0) ? 'supersede-b' : 'supersede-a');
        conflicts.push({
          intentA: a,
          intentB: b,
          reason: `Overlapping scope with different outcomes: ${a.desiredOutcome} vs ${b.desiredOutcome}`,
          resolution,
        });
      }
    }
  }

  return { ordered: Object.freeze(ordered), conflicts: Object.freeze(conflicts) };
};

const scopesOverlap = (a: CompiledIntent, b: CompiledIntent): boolean => {
  const aKeys = new Set(Object.keys(a.scope));
  for (const key of Object.keys(b.scope)) {
    if (aKeys.has(key)) return true;
  }
  return false;
};

/**
 * Resolves conflicts between two policy snapshots.
 * Returns a merged policy and any conflicts.
 */
export const resolvePolicyConflict = (
  policyA: PolicySnapshot,
  policyB: PolicySnapshot,
  strategy: 'union' | 'intersection' | 'hierarchical' = 'hierarchical',
): { readonly merged: PolicySnapshot; readonly conflicts: readonly PolicyConflict[] } => {
  const conflicts: PolicyConflict[] = [];
  const conflictsFound: PolicyConflict[] = [];

  // Detect conflicts
  if (!shallowEqual(policyA.policy.allowedActions, policyB.policy.allowedActions)) {
    conflictsFound.push({
      policyA,
      policyB,
      reason: 'allowedActions differ',
      resolution: strategy,
    });
  }
  if (!shallowEqual(policyA.policy.deniedActions, policyB.policy.deniedActions)) {
    conflictsFound.push({
      policyA,
      policyB,
      reason: 'deniedActions differ',
      resolution: strategy,
    });
  }
  if (!shallowEqualRecord(policyA.policy.capabilityRequirements, policyB.policy.capabilityRequirements)) {
    conflictsFound.push({
      policyA,
      policyB,
      reason: 'capabilityRequirements differ',
      resolution: strategy,
    });
  }
  if (policyA.policy.confidenceThreshold !== policyB.policy.confidenceThreshold) {
    conflictsFound.push({
      policyA,
      policyB,
      reason: 'confidenceThreshold differ',
      resolution: strategy,
    });
  }
  if (policyA.policy.failClosed !== policyB.policy.failClosed) {
    conflictsFound.push({
      policyA,
      policyB,
      reason: 'failClosed differ',
      resolution: strategy,
    });
  }

  // Merge based on strategy
  const mergedPolicy: PolicySnapshot = {
    ...policyA,
    policy: {
      ...policyA.policy,
      allowedActions: mergeArrays(policyA.policy.allowedActions, policyB.policy.allowedActions, strategy),
      deniedActions: mergeArrays(policyA.policy.deniedActions, policyB.policy.deniedActions, strategy),
      capabilityRequirements: mergeCapabilityRequirements(
        policyA.policy.capabilityRequirements,
        policyB.policy.capabilityRequirements,
        strategy,
      ),
      confidenceThreshold: mergeThreshold(
        policyA.policy.confidenceThreshold,
        policyB.policy.confidenceThreshold,
        strategy,
      ),
      failClosed: strategy === 'intersection'
        ? policyA.policy.failClosed && policyB.policy.failClosed
        : policyA.policy.failClosed || policyB.policy.failClosed,
    },
  };

  return { merged: Object.freeze(mergedPolicy), conflicts: Object.freeze(conflictsFound) };
};

const shallowEqual = <T>(a: readonly T[], b: readonly T[]): boolean => {
  if (a.length !== b.length) return false;
  return a.every((val, idx) => val === b[idx]);
};

const shallowEqualRecord = <T>(a: Readonly<Record<string, T>>, b: Readonly<Record<string, T>>): boolean => {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => a[k] === b[k]);
};

const mergeArrays = <T>(
  a: readonly T[],
  b: readonly T[],
  strategy: 'union' | 'intersection' | 'hierarchical',
): readonly T[] => {
  if (strategy === 'intersection') {
    return a.filter((x) => b.includes(x));
  }
  if (strategy === 'union') {
    return Array.from(new Set([...a, ...b]));
  }
  // hierarchical: first policy wins (policyA is higher priority)
  return a;
};

const mergeCapabilityRequirements = (
  a: Readonly<Record<string, readonly string[]>>,
  b: Readonly<Record<string, readonly string[]>>,
  strategy: 'union' | 'intersection' | 'hierarchical',
): Readonly<Record<string, readonly string[]>> => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const result: Record<string, readonly string[]> = {};
  for (const key of keys) {
    const av = a[key] ?? [];
    const bv = b[key] ?? [];
    result[key] = mergeArrays(av, bv, strategy);
  }
  return Object.freeze(result);
};

const mergeThreshold = (
  a: number,
  b: number,
  strategy: 'union' | 'intersection' | 'hierarchical',
): number => {
  if (strategy === 'intersection') return Math.max(a, b); // stricter
  if (strategy === 'union') return Math.min(a, b); // more permissive
  return a; // hierarchical: first wins
};

/**
 * Enforces intent autonomy at the mutation boundary.
 * Throws if the action class exceeds the intent's autonomy level.
 */
export const enforceAutonomy = (
  intent: CompiledIntent,
  actionClass: 'read' | 'advise' | 'safe_mutate' | 'autonomous' | 'high_risk',
): void => {
  if (!isAutonomyPermitted(intent, actionClass)) {
    throw new Error(
      `Autonomy violation: intent ${intent.intentId} (autonomy=${intent.autonomy}) ` +
      `does not permit action class ${actionClass}`,
    );
  }
};

/**
 * Maps action intents to autonomy action classes for enforcement.
 */
export const ACTION_CLASS: Readonly<Record<string, 'read' | 'advise' | 'safe_mutate' | 'autonomous' | 'high_risk'>> = Object.freeze({
  noop: 'read',
  health_reprobe: 'advise',
  dns_switch: 'safe_mutate',
  provider_switch: 'safe_mutate',
  route_change: 'autonomous',
  tunnel_switch: 'autonomous',
  connectivity_failover: 'autonomous',
  recovery: 'high_risk',
  rollback: 'high_risk',
  degraded_mode: 'autonomous',
});

/**
 * Canonical intent store interface — for durable persistence of intents.
 * Implementations provide the actual storage (DB, etcd, etc.).
 */
export interface IntentStore {
  readonly get: (id: string) => Promise<CompiledIntent | undefined>;
  readonly getActive: (at?: Date) => Promise<readonly CompiledIntent[]>;
  readonly put: (intent: CompiledIntent) => Promise<void>;
  readonly delete: (id: string) => Promise<void>;
}

/**
 * In-memory intent store for testing and simulation.
 */
export class InMemoryIntentStore implements IntentStore {
  private readonly store = new Map<string, CompiledIntent>();

  async get(id: string): Promise<CompiledIntent | undefined> {
    return this.store.get(id);
  }

  async getActive(at = new Date()): Promise<readonly CompiledIntent[]> {
    const all = Array.from(this.store.values());
    return all.filter((intent) => {
      const from = intent.effectiveFrom ? Date.parse(intent.effectiveFrom) : Number.NEGATIVE_INFINITY;
      const expires = intent.expiresAt ? Date.parse(intent.expiresAt) : Number.POSITIVE_INFINITY;
      const timestamp = at.getTime();
      return timestamp >= from && timestamp < expires;
    });
  }

  async put(intent: CompiledIntent): Promise<void> {
    this.store.set(intent.intentId, intent);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}