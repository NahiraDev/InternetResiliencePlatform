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
/**
 * Monotonic epoch source. Every externally-visible decision bump advances it,
 * which invalidates reservations and in-flight decisions computed earlier.
 */
export class DecisionEpoch {
    epochValue = 1;
    current() {
        return this.epochValue;
    }
    advance() {
        this.epochValue += 1;
        return this.epochValue;
    }
    isCurrent(epoch) {
        return epoch === this.epochValue;
    }
}
/**
 * Bounded resource reservation table with capacity limits, epoch guarding,
 * resource-version guarding and TTL expiry.
 */
export class ResourceReservationTable {
    epoch;
    reservations = new Map();
    versions = new Map();
    capacities = new Map();
    sequence = 0;
    constructor(epoch, capacityByResource = {}) {
        this.epoch = epoch;
        for (const [resourceId, capacity] of Object.entries(capacityByResource)) {
            if (!Number.isInteger(capacity) || capacity < 1) {
                throw new RangeError(`reservation capacity for ${resourceId} must be >= 1`);
            }
            this.capacities.set(resourceId, capacity);
        }
    }
    /** Records the current version of a resource so stale decisions can be caught. */
    observeResourceVersion(resourceId, version) {
        this.versions.set(resourceId, version);
    }
    currentResourceVersion(resourceId) {
        return this.versions.get(resourceId);
    }
    pruneExpired(nowMs) {
        for (const [id, reservation] of this.reservations) {
            if (reservation.expiresAtMs <= nowMs)
                this.reservations.delete(id);
        }
    }
    reservedResourceIds(nowMs = Date.now()) {
        this.pruneExpired(nowMs);
        return Object.freeze([...this.reservations.values()].map((r) => r.resourceId));
    }
    reserve(request) {
        const nowMs = request.now ?? Date.now();
        this.pruneExpired(nowMs);
        if (!Number.isFinite(request.ttlMs) || request.ttlMs <= 0) {
            throw new RangeError('reservation ttlMs must be > 0');
        }
        if (!this.epoch.isCurrent(request.epoch)) {
            return { granted: false, reason: 'epoch-too-old' };
        }
        const knownVersion = this.versions.get(request.resourceId);
        if (request.resourceVersion !== undefined &&
            knownVersion !== undefined &&
            request.resourceVersion !== knownVersion) {
            return { granted: false, reason: 'resource-version-mismatch' };
        }
        const held = [...this.reservations.values()].filter((r) => r.resourceId === request.resourceId);
        if (held.length > 0) {
            return { granted: false, reason: 'already-reserved' };
        }
        const capacity = this.capacities.get(request.resourceId);
        if (capacity !== undefined) {
            const total = held.length;
            if (total >= capacity)
                return { granted: false, reason: 'capacity-exceeded' };
        }
        this.sequence += 1;
        const reservation = Object.freeze({
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
    release(reservationId) {
        return this.reservations.delete(reservationId);
    }
    releaseAll() {
        this.reservations.clear();
    }
    /**
     * Validates a decision immediately before execution. This is the stale
     * decision gate: a decision computed against an older epoch, a resource whose
     * version moved, or an expired reservation must not execute.
     */
    validateForExecution(reservationId, options) {
        const nowMs = options.now ?? Date.now();
        this.pruneExpired(nowMs);
        const reservation = this.reservations.get(reservationId);
        if (!reservation)
            return { stale: true, reason: 'ttl-expired' };
        if (!this.epoch.isCurrent(options.epoch) || reservation.epoch !== options.epoch) {
            return { stale: true, reason: 'epoch-superseded' };
        }
        if (reservation.resourceId !== options.resourceId) {
            return { stale: true, reason: 'resource-version-changed' };
        }
        const knownVersion = this.versions.get(options.resourceId);
        if (reservation.resourceVersion !== undefined &&
            knownVersion !== undefined &&
            reservation.resourceVersion !== knownVersion) {
            return { stale: true, reason: 'resource-version-changed' };
        }
        return { stale: false };
    }
    snapshot() {
        return deepFreeze({
            epoch: this.epoch.current(),
            reservations: [...this.reservations.values()],
            versions: Object.fromEntries(this.versions),
        });
    }
}
export const buildStructuredPlan = (input) => {
    const selected = input.selected;
    const steps = [
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
//# sourceMappingURL=reservation.js.map