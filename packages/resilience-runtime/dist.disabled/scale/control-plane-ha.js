/**
 * Phase 146 — Control-Plane High Availability.
 *
 * Deterministic replica-group membership: heartbeat liveness, quorum-gated
 * leadership with monotonically increasing terms, and fencing tokens so a
 * deposed leader's writes are rejected. Without quorum there is no leader —
 * the group fails safe (read-only) instead of splitting the brain.
 */
export class ReplicaGroup {
    clusterSize;
    heartbeatTtlMs;
    replicas = new Map();
    term = 0;
    leader;
    fencing = 0;
    /** `clusterSize` is the configured membership; quorum is a strict majority of it. */
    constructor(clusterSize, heartbeatTtlMs) {
        this.clusterSize = clusterSize;
        this.heartbeatTtlMs = heartbeatTtlMs;
        if (!Number.isInteger(clusterSize) || clusterSize < 1)
            throw new Error('clusterSize must be a positive integer');
        if (!(heartbeatTtlMs > 0))
            throw new Error('heartbeatTtlMs must be positive');
    }
    heartbeat(id, rank, nowMs) {
        if (!this.replicas.has(id) && this.replicas.size >= this.clusterSize)
            throw new Error('replica group is full');
        this.replicas.set(id, Object.freeze({ id, rank, lastHeartbeatMs: nowMs }));
    }
    live(nowMs) { return [...this.replicas.values()].filter((r) => nowMs - r.lastHeartbeatMs <= this.heartbeatTtlMs).sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id)); }
    /** Re-evaluates leadership. The term and fencing token advance only when the leader changes. */
    evaluate(nowMs) {
        const live = this.live(nowMs);
        const quorum = live.length >= Math.floor(this.clusterSize / 2) + 1;
        const stillLive = this.leader !== undefined && live.some((r) => r.id === this.leader);
        if (!quorum) {
            if (this.leader !== undefined) {
                this.leader = undefined;
                this.term += 1;
                this.fencing += 1;
            }
        }
        else if (!stillLive) {
            this.leader = live[0].id;
            this.term += 1;
            this.fencing += 1;
        }
        return Object.freeze({ term: this.term, ...(this.leader ? { leaderId: this.leader } : {}), hasQuorum: quorum, liveReplicas: Object.freeze(live.map((r) => r.id)), fencingToken: this.fencing });
    }
    /** Whether a write carrying `token` from `replicaId` may be accepted right now. */
    acceptWrite(replicaId, token, nowMs) {
        const v = this.evaluate(nowMs);
        return v.hasQuorum && v.leaderId === replicaId && token === v.fencingToken;
    }
}
/** A resource guarded by fencing tokens: writes with an older token than already seen are rejected. */
export class FencedResource {
    highest = 0;
    value;
    write(token, value) { if (token < this.highest)
        return false; this.highest = token; this.value = value; return true; }
    read() { return this.value; }
    get fenceFloor() { return this.highest; }
}
//# sourceMappingURL=control-plane-ha.js.map