/**
 * Resource reservation, concurrency control and stale-decision protection for
 * issue #277 (issue #272 Section F).
 *
 * Section F requires:
 *  - resource reservation and concurrency control between intent and execution;
 *  - protection against stale decisions using generation/epoch/resource-version/TTL.
 *
 * Reservations are held by the canonical runtime. Domain packages never reserve
 * privileged resources themselves.
 */

import { deepFreeze } from '../domain/ids.js';
import type { CandidateAction } from '../domain/types.js';

export interface ResourceVersion {
  /** Opaque version token for the resource, supplied by the owning adapter. */
  readonly version: string;
}

export interface ReservationRequest {
  readonly resourceId: string;
  /** Epoch the decision was computed against. */
  readonly epoch: number;
  readonly resourceVersion?: string;
  /** Time-to-live for the reservation in milliseconds. */
  readonly ttlMs: number;
  readonly now?: number;
}

export type ReservationRejection =
  | 'already-reserved'
  | 'epoch-too-old'
  | 'resource-version-mismatch'
  | 'capacity-exceeded'
  | 'ttl-expired';

export interface Reservation {
  readonly reservationId: string;
  readonly resourceId: string;
  readonly epoch: number;
  readonly resourceVersion?: string;
  readonly expiresAtMs: number;
}

export interface ReservationDecision {
  readonly granted: boolean;
  readonly reservation?: Reservation;
  readonly reason?: ReservationRejection;
}

export interface StaleDecisionReason {
  readonly stale: boolean;
  readonly reason?: 'epoch-superseded' | 'resource-version-changed' | 'ttl-expired';
}

/**
 * Monotonic epoch source. Every externally-visible decision bump advances it,
 * which invalidates reservations and in-flight decisions computed earlier.
 */
export class DecisionEpoch {
  private epochValue = 1;
  current(): number {
    return this.epochValue;
  }
  advance(): number {
    this.epochValue += 1;
    return this.epochValue;
  }
  isCurrent(epoch: number): boolean {
    return epoch === this.epochValue;
  }
}

/**
 * Bounded resource reservation table with capacity limits, epoch guarding,
 * resource-version guarding and TTL expiry.
 */
export class ResourceReservationTable {
  private readonly reservations = new Map<string, Reservation>();
  private readonly versions = new Map<string, string>();
  private readonly capacities = new Map<string, number>();
  private sequence = 0;

  constructor(
    private readonly epoch: DecisionEpoch,
    capacityByResource: Readonly<Record<string, number>> = {},
  ) {
    for (const [resourceId, capacity] of Object.entries(capacityByResource)) {
      if (!Number.isInteger(capacity) || capacity < 1) {
        throw new RangeError(`reservation capacity for ${resourceId} must be >= 1`);
      }
      this.capacities.set(resourceId, capacity);
    }
  }

  /** Records the current version of a resource so stale decisions can be caught. */
  observeResourceVersion(resourceId: string, version: string): void {
    this.versions.set(resourceId, version);
  }

  currentResourceVersion(resourceId: string): string | undefined {
    return this.versions.get(resourceId);
  }

  private pruneExpired(nowMs: number): void {
    for (const [id, reservation] of this.reservations) {
      if (reservation.expiresAtMs <= nowMs) this.reservations.delete(id);
    }
  }

  reservedResourceIds(nowMs: number = Date.now()): readonly string[] {
    this.pruneExpired(nowMs);
    return Object.freeze([...this.reservations.values()].map((r) => r.resourceId));
  }

  reserve(request: ReservationRequest): ReservationDecision {
    const nowMs = request.now ?? Date.now();
    this.pruneExpired(nowMs);

    if (!Number.isFinite(request.ttlMs) || request.ttlMs <= 0) {
      throw new RangeError('reservation ttlMs must be > 0');
    }
    if (!this.epoch.isCurrent(request.epoch)) {
      return { granted: false, reason: 'epoch-too-old' };
    }
    const knownVersion = this.versions.get(request.resourceId);
    if (
      request.resourceVersion !== undefined &&
      knownVersion !== undefined &&
      request.resourceVersion !== knownVersion
    ) {
      return { granted: false, reason: 'resource-version-mismatch' };
    }
    const held = [...this.reservations.values()].filter(
      (r) => r.resourceId === request.resourceId,
    );
    if (held.length > 0) {
      return { granted: false, reason: 'already-reserved' };
    }
    const capacity = this.capacities.get(request.resourceId);
    if (capacity !== undefined) {
      const total = held.length;
      if (total >= capacity) return { granted: false, reason: 'capacity-exceeded' };
    }

    this.sequence += 1;
    const reservation: Reservation = Object.freeze({
      reservationId: `res-${this.sequence}`,
      resourceId: request.resourceId,
      epoch: request.epoch,
      expiresAtMs: nowMs + request.ttlMs,
      ...(request.resourceVersion !== undefined
        ? { resourceVersion: request.resourceVersion }
        : {}),
    });
    this.reservations.set(reservation.reservationId, reservation);
    return { granted: true, reservation };
  }

  release(reservationId: string): boolean {
    return this.reservations.delete(reservationId);
  }

  releaseAll(): void {
    this.reservations.clear();
  }

  /**
   * Validates a decision immediately before execution. This is the stale
   * decision gate: a decision computed against an older epoch, a resource whose
   * version moved, or an expired reservation must not execute.
   */
  validateForExecution(
    reservationId: string,
    options: { readonly epoch: number; readonly resourceId: string; readonly now?: number },
  ): StaleDecisionReason {
    const nowMs = options.now ?? Date.now();
    this.pruneExpired(nowMs);
    const reservation = this.reservations.get(reservationId);
    if (!reservation) return { stale: true, reason: 'ttl-expired' };
    if (!this.epoch.isCurrent(options.epoch) || reservation.epoch !== options.epoch) {
      return { stale: true, reason: 'epoch-superseded' };
    }
    if (reservation.resourceId !== options.resourceId) {
      return { stale: true, reason: 'resource-version-changed' };
    }
    const knownVersion = this.versions.get(options.resourceId);
    if (
      reservation.resourceVersion !== undefined &&
      knownVersion !== undefined &&
      reservation.resourceVersion !== knownVersion
    ) {
      return { stale: true, reason: 'resource-version-changed' };
    }
    return { stale: false };
  }

  snapshot(): {
    readonly epoch: number;
    readonly reservations: readonly Reservation[];
    readonly versions: Readonly<Record<string, string>>;
  } {
    return deepFreeze({
      epoch: this.epoch.current(),
      reservations: [...this.reservations.values()],
      versions: Object.fromEntries(this.versions),
    });
  }
}

/**
 * Structured execution plan envelope: preconditions, ordered steps, safety
 * boundaries, timeout, verification and rollback (Section F).
 */
export interface PlanStep {
  readonly order: number;
  readonly intent: string;
  readonly requiredCapabilities: readonly string[];
  readonly postconditions: readonly string[];
}

export interface StructuredPlan {
  readonly planId: string;
  readonly epoch: number;
  readonly preconditions: readonly string[];
  readonly steps: readonly PlanStep[];
  readonly safetyBoundaries: readonly string[];
  readonly timeoutMs: number;
  readonly verificationRequirements: readonly string[];
  readonly rollbackStrategy?: string;
  readonly objectiveScore: number;
  readonly objectiveContributions: Readonly<Record<string, number>>;
}

export const buildStructuredPlan = (input: {
  readonly planId: string;
  readonly epoch: number;
  readonly selected: CandidateAction;
  readonly alternatives: readonly CandidateAction[];
  readonly preconditions?: readonly string[];
  readonly safetyBoundaries?: readonly string[];
  readonly timeoutMs?: number;
  readonly objectiveScore: number;
  readonly objectiveContributions: Readonly<Record<string, number>>;
}): StructuredPlan => {
  const selected = input.selected;
  const steps: PlanStep[] = [
    {
      order: 1,
      intent: selected.intent,
      requiredCapabilities: [...selected.requiredCapabilities],
      postconditions: [...selected.postconditions],
    },
    // Ordered fallbacks: if the primary action fails, the planner's ranked
    // alternatives are the declared recovery ladder.
    ...input.alternatives.map((alternative, index) => ({
      order: index + 2,
      intent: alternative.intent,
      requiredCapabilities: [...alternative.requiredCapabilities],
      postconditions: [...alternative.postconditions],
    })),
  ];
  return deepFreeze({
    planId: input.planId,
    epoch: input.epoch,
    preconditions: input.preconditions ?? ['policy-allows-action', 'capabilities-available'],
    steps,
    safetyBoundaries: input.safetyBoundaries ?? [
      'no-mutation-without-policy',
      'no-mutation-without-capability',
      'transactional-apply-with-rollback',
    ],
    timeoutMs: input.timeoutMs ?? 30_000,
    verificationRequirements: [...selected.verificationRequirements],
    ...(selected.rollbackStrategy !== undefined
      ? { rollbackStrategy: selected.rollbackStrategy }
      : {}),
    objectiveScore: input.objectiveScore,
    objectiveContributions: input.objectiveContributions,
  });
};
