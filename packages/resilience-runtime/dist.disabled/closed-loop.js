import { detectIntentDrift } from './intent/drift.js';
const DEFAULT_MAX_CYCLES = 1;
const MAX_ALLOWED_CYCLES = 10;
const DEFAULT_INTERVAL_MS = 0;
const terminalHealthyOutcomes = new Set([
    'success',
    'recovered',
    'noop',
    'simulated',
]);
const assertIntegerInRange = (value, name, min, max) => {
    if (!Number.isInteger(value) || value < min || value > max) {
        throw new RangeError(`${name} must be an integer between ${min} and ${max}`);
    }
};
const assertNonNegativeInteger = (value, name) => {
    if (!Number.isInteger(value) || value < 0) {
        throw new RangeError(`${name} must be a non-negative integer`);
    }
};
const sleep = async (milliseconds, signal) => {
    if (milliseconds === 0)
        return;
    if (signal?.aborted)
        return;
    await new Promise((resolve) => {
        const timer = setTimeout(resolve, milliseconds);
        signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            resolve();
        }, { once: true });
    });
};
const collectDriftAssessments = (options) => {
    if (!options.driftInputs)
        return undefined;
    const { intent, observed, at } = options.driftInputs;
    // Pure observation only — never mutates and never calls privileged paths.
    return [detectIntentDrift(intent, observed, at)];
};
/**
 * Runs the existing ResilienceRuntime in a bounded observe→decide→apply→verify/recover loop.
 * This class owns only loop control and stop conditions; decision, policy, execution,
 * verification and recovery remain owned by ResilienceRuntime and its canonical components.
 * Optional drift assessments are observe-only and must be re-admitted through governance
 * before any corrective action.
 */
export class BoundedClosedLoopController {
    runtime;
    constructor(runtime) {
        this.runtime = runtime;
    }
    async run(options = {}) {
        const maxCycles = options.maxCycles ?? DEFAULT_MAX_CYCLES;
        const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
        const stopWhenHealthy = options.stopWhenHealthy ?? true;
        const signal = options.signal;
        const driftAssessments = collectDriftAssessments(options);
        assertIntegerInRange(maxCycles, 'maxCycles', 1, MAX_ALLOWED_CYCLES);
        assertNonNegativeInteger(intervalMs, 'intervalMs');
        const records = [];
        const baseCorrelationId = options.correlationId ?? options.context?.correlationId ?? 'closed-loop';
        const baseIdempotencyKey = options.idempotencyKey ?? baseCorrelationId;
        const runtimeContextOverrides = {
            ...(options.context ?? {}),
        };
        for (const key of [
            'runtimeId',
            'mode',
            'deadline',
            'cancelled',
            'securityContext',
            'policySnapshot',
            'capabilitySnapshot',
            'observationSnapshot',
            'configuration',
            'correlationId',
        ]) {
            const value = options[key];
            if (value !== undefined) {
                runtimeContextOverrides[key] = value;
            }
        }
        const withDrift = (result) => driftAssessments ? { ...result, driftAssessments } : result;
        for (let cycleNumber = 1; cycleNumber <= maxCycles; cycleNumber += 1) {
            if (signal?.aborted) {
                return withDrift({
                    status: 'aborted',
                    stopReason: 'aborted',
                    cyclesCompleted: records.length,
                    records,
                });
            }
            await sleep(cycleNumber === 1 ? 0 : intervalMs, signal);
            if (signal?.aborted) {
                return withDrift({
                    status: 'aborted',
                    stopReason: 'aborted',
                    cyclesCompleted: records.length,
                    records,
                });
            }
            let record;
            try {
                record = await this.runtime.cycle({
                    ...runtimeContextOverrides,
                    correlationId: `${baseCorrelationId}/cycle-${cycleNumber}`,
                    idempotencyKey: `${baseIdempotencyKey}/cycle-${cycleNumber}`,
                });
            }
            catch (error) {
                if (signal?.aborted) {
                    return withDrift({
                        status: 'aborted',
                        stopReason: 'aborted',
                        cyclesCompleted: records.length,
                        records,
                    });
                }
                throw error;
            }
            records.push(record);
            if (stopWhenHealthy && terminalHealthyOutcomes.has(record.outcome)) {
                return withDrift({
                    status: 'healthy',
                    stopReason: 'healthy',
                    cyclesCompleted: records.length,
                    records,
                });
            }
            if (record.outcome === 'blocked') {
                return withDrift({
                    status: 'blocked',
                    stopReason: 'blocked',
                    cyclesCompleted: records.length,
                    records,
                });
            }
            if (record.outcome === 'failed') {
                return withDrift({
                    status: 'failed',
                    stopReason: 'failed',
                    cyclesCompleted: records.length,
                    records,
                });
            }
        }
        return withDrift({
            status: 'bounded',
            stopReason: 'max_cycles',
            cyclesCompleted: records.length,
            records,
        });
    }
}
//# sourceMappingURL=closed-loop.js.map