/**
 * Canonical fabric resource state machine, freshness and failure-domain
 * diversity (issue #275, tasks 2/3/7).
 *
 * The 11 canonical states already exist in `fabric.ts`; this module makes the
 * legal transitions explicit so a resource cannot silently jump from FAILED to
 * HEALTHY (it must pass through RECOVERING), and provides the diversity maths
 * that `select()` previously approximated with a boolean "has a preferred
 * failure domain" check.
 */

import type { FabricResource, FabricResourceState } from './fabric.js';

/**
 * Legal target states per current state.
 * - Terminal-ish states (UNAVAILABLE, QUARANTINED) require explicit recovery.
 * - FAILED/BLOCKED/RESTRICTED must pass through RECOVERING before HEALTHY.
 * - DRAINING must pass through UNAVAILABLE or RECOVERING before reuse.
 */
export const FABRIC_STATE_TRANSITIONS: Readonly<
  Record<FabricResourceState, readonly FabricResourceState[]>
> = Object.freeze({
  UNKNOWN: ['DISCOVERING', 'HEALTHY', 'DEGRADED', 'FAILED', 'UNAVAILABLE', 'BLOCKED'],
  DISCOVERING: ['HEALTHY', 'DEGRADED', 'FAILED', 'RESTRICTED', 'UNAVAILABLE', 'BLOCKED'],
  HEALTHY: ['DEGRADED', 'DRAINING', 'FAILED', 'BLOCKED', 'RESTRICTED', 'UNAVAILABLE'],
  DEGRADED: [
    'HEALTHY',
    'RECOVERING',
    'DRAINING',
    'FAILED',
    'BLOCKED',
    'QUARANTINED',
    'UNAVAILABLE',
  ],
  FAILED: ['RECOVERING', 'UNAVAILABLE', 'QUARANTINED'],
  BLOCKED: ['RECOVERING', 'UNAVAILABLE', 'RESTRICTED'],
  RESTRICTED: ['RECOVERING', 'UNAVAILABLE', 'BLOCKED'],
  RECOVERING: ['HEALTHY', 'DEGRADED', 'FAILED', 'UNAVAILABLE', 'QUARANTINED'],
  QUARANTINED: ['RECOVERING', 'UNAVAILABLE'],
  DRAINING: ['UNAVAILABLE', 'RECOVERING', 'DEGRADED'],
  UNAVAILABLE: ['DISCOVERING', 'RECOVERING'],
});

export const isLegalFabricTransition = (
  from: FabricResourceState,
  to: FabricResourceState,
): boolean => FABRIC_STATE_TRANSITIONS[from].includes(to);

export class IllegalFabricStateTransitionError extends Error {
  readonly code = 'ILLEGAL_FABRIC_STATE_TRANSITION';
  constructor(
    readonly from: FabricResourceState,
    readonly to: FabricResourceState,
  ) {
    super(
      `illegal fabric resource state transition ${from} -> ${to}; allowed: ${FABRIC_STATE_TRANSITIONS[from].join(', ')}`,
    );
    this.name = 'IllegalFabricStateTransitionError';
  }
}

export const assertFabricStateTransition = (
  from: FabricResourceState,
  to: FabricResourceState,
): void => {
  if (from === to) return;
  if (!isLegalFabricTransition(from, to)) throw new IllegalFabricStateTransitionError(from, to);
};

/**
 * States from which a resource may serve selection.
 *
 * RECOVERING and RESTRICTED are deliberately excluded. A resource that is still
 * recovering has not re-established its outcome, and a policy-restricted
 * resource is not permitted to carry traffic; selecting either would let an
 * unverified or disallowed path reach the data plane.
 */
export const SELECTABLE_FABRIC_STATES: ReadonlySet<FabricResourceState> = new Set([
  'HEALTHY',
  'DEGRADED',
]);

export interface FreshnessReport {
  readonly resourceId: string;
  readonly fresh: boolean;
  readonly ageMs: number;
  readonly expiresAt?: string;
  readonly expiredForMs?: number;
}

/** Freshness is evaluated per resource against an explicit clock. */
export const evaluateFabricFreshness = (
  resource: FabricResource,
  nowIso: string,
): FreshnessReport => {
  const now = Date.parse(nowIso);
  const observed = Date.parse(resource.observedAt);
  const ageMs = Number.isFinite(observed) ? Math.max(0, now - observed) : Number.POSITIVE_INFINITY;
  if (!resource.expiresAt) {
    return Object.freeze({
      resourceId: resource.id,
      fresh: Number.isFinite(ageMs),
      ageMs,
    });
  }
  const expires = Date.parse(resource.expiresAt);
  const expiredForMs = Number.isFinite(expires)
    ? Math.max(0, now - expires)
    : Number.POSITIVE_INFINITY;
  const fresh = Number.isFinite(expires) && now < expires;
  return Object.freeze({
    resourceId: resource.id,
    fresh,
    ageMs,
    expiresAt: resource.expiresAt,
    ...(Number.isFinite(expiredForMs) ? { expiredForMs } : {}),
  });
};

export const partitionByFreshness = (
  resources: readonly FabricResource[],
  nowIso: string,
): { readonly fresh: readonly FabricResource[]; readonly stale: readonly FabricResource[] } => {
  const fresh: FabricResource[] = [];
  const stale: FabricResource[] = [];
  for (const resource of resources) {
    if (evaluateFabricFreshness(resource, nowIso).fresh) fresh.push(resource);
    else stale.push(resource);
  }
  return { fresh: Object.freeze(fresh), stale: Object.freeze(stale) };
};

/**
 * True failure-domain diversity.
 *
 * Two candidates are only diverse when they share **no** failure domain.
 * `select()` previously scored "has at least one preferred domain", which
 * cannot distinguish genuinely independent paths from two paths through the
 * same upstream carrier.
 */
export const sharesFailureDomain = (a: FabricResource, b: FabricResource): boolean => {
  const domains = new Set(a.failureDomains);
  return b.failureDomains.some((domain) => domains.has(domain));
};

export interface DiverseSelection {
  readonly selected: FabricResource | undefined;
  /** Ordered candidates; each entry is disjoint from all previously chosen ones. */
  readonly diverse: readonly FabricResource[];
  readonly fallback: readonly FabricResource[];
  /** Distinct failure domains spanned by the diverse selection. */
  readonly distinctFailureDomains: number;
  readonly reason: string;
}

/** Count of distinct failure domains spanned by a candidate set. */
export const countDistinctFailureDomains = (resources: readonly FabricResource[]): number =>
  new Set(resources.flatMap((resource) => [...resource.failureDomains])).size;

/**
 * Greedy maximal-disjoint selection: repeatedly take the highest ranked
 * candidate that shares no failure domain with anything already chosen.
 */
export const selectDiverseResources = (
  ranked: readonly FabricResource[],
  options: { readonly required?: number } = {},
): DiverseSelection => {
  const diverse: FabricResource[] = [];
  const fallback: FabricResource[] = [];
  for (const candidate of ranked) {
    if (diverse.every((chosen) => !sharesFailureDomain(chosen, candidate))) {
      diverse.push(candidate);
    } else {
      fallback.push(candidate);
    }
  }
  const required = options.required ?? 2;
  const [selected] = diverse;
  return Object.freeze({
    selected,
    diverse: Object.freeze(diverse),
    fallback: Object.freeze(fallback),
    distinctFailureDomains: countDistinctFailureDomains(diverse),
    reason:
      selected && diverse.length >= required
        ? `selected ${selected.id} with ${diverse.length} failure-domain-disjoint alternatives`
        : selected
          ? `selected ${selected.id} but fewer than ${required} disjoint alternatives exist`
          : 'no candidate available for diversity selection',
  });
};
