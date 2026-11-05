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
export type ReservationRejection = 'already-reserved' | 'epoch-too-old' | 'resource-version-mismatch' | 'capacity-exceeded' | 'ttl-expired';
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
export declare class DecisionEpoch {
    private epochValue;
    current(): number;
    advance(): number;
    isCurrent(epoch: number): boolean;
}
/**
 * Bounded resource reservation table with capacity limits, epoch guarding,
 * resource-version guarding and TTL expiry.
 */
export declare class ResourceReservationTable {
    private readonly epoch;
    private readonly reservations;
    private readonly versions;
    private readonly capacities;
    private sequence;
    constructor(epoch: DecisionEpoch, capacityByResource?: Readonly<Record<string, number>>);
    /** Records the current version of a resource so stale decisions can be caught. */
    observeResourceVersion(resourceId: string, version: string): void;
    currentResourceVersion(resourceId: string): string | undefined;
    private pruneExpired;
    reservedResourceIds(nowMs?: number): readonly string[];
    reserve(request: ReservationRequest): ReservationDecision;
    release(reservationId: string): boolean;
    releaseAll(): void;
    /**
     * Validates a decision immediately before execution. This is the stale
     * decision gate: a decision computed against an older epoch, a resource whose
     * version moved, or an expired reservation must not execute.
     */
    validateForExecution(reservationId: string, options: {
        readonly epoch: number;
        readonly resourceId: string;
        readonly now?: number;
    }): StaleDecisionReason;
    snapshot(): {
        readonly epoch: number;
        readonly reservations: readonly Reservation[];
        readonly versions: Readonly<Record<string, string>>;
    };
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
export declare const buildStructuredPlan: (input: {
    readonly planId: string;
    readonly epoch: number;
    readonly selected: CandidateAction;
    readonly alternatives: readonly CandidateAction[];
    readonly preconditions?: readonly string[];
    readonly safetyBoundaries?: readonly string[];
    readonly timeoutMs?: number;
    readonly objectiveScore: number;
    readonly objectiveContributions: Readonly<Record<string, number>>;
}) => StructuredPlan;
//# sourceMappingURL=reservation.d.ts.map