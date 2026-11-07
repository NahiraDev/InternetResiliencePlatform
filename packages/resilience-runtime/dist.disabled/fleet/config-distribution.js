/**
 * Phase 116 — Remote Configuration & Policy Distribution.
 *
 * Versioned, content-addressed, signed configuration bundles with staged
 * (canary → wave → full) rollout, deterministic cohort assignment, acknowledgement
 * tracking and automatic rollback when the failure ratio breaches a threshold.
 * Distribution only publishes desired configuration; each device applies it
 * through its own canonical runtime and policy gates.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { deviceMatches } from './inventory.js';
export const hashPayload = (payload) => createHash('sha256').update(payload).digest('hex');
export const signBundle = (secret, b) => {
    const contentHash = hashPayload(b.payload);
    const signature = createHmac('sha256', secret).update(`${b.bundleId}|${b.version}|${b.kind}|${contentHash}`).digest('base64url');
    return Object.freeze({ ...b, contentHash, signature });
};
export const verifyBundle = (secret, b) => {
    if (hashPayload(b.payload) !== b.contentHash)
        return false;
    const expected = Buffer.from(createHmac('sha256', secret).update(`${b.bundleId}|${b.version}|${b.kind}|${b.contentHash}`).digest('base64url'));
    const given = Buffer.from(b.signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
};
export const DEFAULT_ROLLOUT_STAGES = Object.freeze([{ name: 'canary', percent: 5 }, { name: 'wave-1', percent: 25 }, { name: 'wave-2', percent: 60 }, { name: 'full', percent: 100 }]);
/** Stable pseudo-random position in [0,100) for a (bundle, device) pair. */
export const cohortPosition = (bundleId, version, deviceId) => {
    const h = createHash('sha256').update(`${bundleId}|${version}|${deviceId}`).digest();
    return (h.readUInt32BE(0) / 0x1_0000_0000) * 100;
};
export class ConfigRollout {
    bundle;
    previous;
    state = 'staged';
    stageIndex = -1;
    targets;
    status = new Map();
    stages;
    maxFailureRatio;
    minSample;
    constructor(bundle, previous, secret, devices, selector, options = {}) {
        this.bundle = bundle;
        this.previous = previous;
        if (!verifyBundle(secret, bundle))
            throw new Error('config bundle failed signature or integrity verification');
        if (previous && previous.bundleId !== bundle.bundleId)
            throw new Error('previous bundle must share the bundle id');
        if (previous && bundle.version <= previous.version)
            throw new Error('bundle version must increase');
        this.stages = [...(options.stages ?? DEFAULT_ROLLOUT_STAGES)].sort((a, b) => a.percent - b.percent);
        if (this.stages.length === 0 || this.stages.some((s) => !(s.percent > 0 && s.percent <= 100)) || this.stages[this.stages.length - 1].percent !== 100)
            throw new Error('rollout stages must end at 100 percent');
        this.maxFailureRatio = options.maxFailureRatio ?? 0.2;
        this.minSample = options.minSampleForFailureRatio ?? 3;
        this.targets = Object.freeze(devices.filter((d) => deviceMatches(d, selector)).map((d) => d.deviceId).sort());
        for (const id of this.targets)
            this.status.set(id, 'pending');
    }
    get currentState() { return this.state; }
    get targetCount() { return this.targets.length; }
    /** Devices whose cohort position falls inside the cumulative percentage of the current stage. */
    eligible() {
        const pct = this.stages[Math.max(0, this.stageIndex)].percent;
        return this.targets.filter((id) => cohortPosition(this.bundle.bundleId, this.bundle.version, id) < pct || pct === 100);
    }
    /** Advances to the next stage and returns the devices newly offered the bundle. */
    advance() {
        if (this.state === 'halted' || this.state === 'rolled-back' || this.state === 'completed')
            return Object.freeze([]);
        if (this.stageIndex >= 0 && this.pendingAcks() > 0)
            return Object.freeze([]);
        if (this.stageIndex + 1 >= this.stages.length) {
            this.state = 'completed';
            return Object.freeze([]);
        }
        this.stageIndex += 1;
        this.state = 'in-progress';
        const offered = this.eligible().filter((id) => this.status.get(id) === 'pending');
        for (const id of offered)
            this.status.set(id, 'offered');
        if (this.stageIndex === this.stages.length - 1 && this.pendingAcks() === 0 && offered.length === 0)
            this.state = 'completed';
        return Object.freeze(offered);
    }
    pendingAcks() { return [...this.status.values()].filter((s) => s === 'offered').length; }
    /** Records a device acknowledgement. Returns the devices that must be rolled back if the rollout halted. */
    acknowledge(deviceId, outcome) {
        if (this.status.get(deviceId) !== 'offered')
            throw new Error(`device ${deviceId} was not offered this bundle`);
        this.status.set(deviceId, outcome);
        const handled = [...this.status.values()].filter((s) => s === 'applied' || s === 'failed');
        const failed = handled.filter((s) => s === 'failed').length;
        if (handled.length >= this.minSample && failed / handled.length > this.maxFailureRatio) {
            this.state = this.previous ? 'rolled-back' : 'halted';
            if (!this.previous)
                return Object.freeze([]);
            const toRevert = [...this.status.entries()].filter(([, s]) => s === 'applied' || s === 'failed' || s === 'offered').map(([id]) => id).sort();
            for (const id of toRevert)
                this.status.set(id, 'rolled-back');
            return Object.freeze(toRevert);
        }
        if (this.state === 'in-progress' && this.stageIndex === this.stages.length - 1 && this.pendingAcks() === 0)
            this.state = 'completed';
        return Object.freeze([]);
    }
    summary() {
        const out = { pending: 0, offered: 0, applied: 0, failed: 0, 'rolled-back': 0 };
        for (const s of this.status.values())
            out[s] += 1;
        return Object.freeze(out);
    }
}
//# sourceMappingURL=config-distribution.js.map