/**
 * Self-health diagnostics for issue #283.
 * Answers "is IRP itself healthy?" independently of network observations,
 * so operators can distinguish daemon distress from network distress.
 */
import { checkPerformanceBudgets, } from './performance-budgets.js';
export const evaluateSelfHealth = (input) => {
    const reasons = [];
    if (input.schedulerFailedTotal > 0) {
        reasons.push(`scheduler failures observed (${input.schedulerFailedTotal})`);
    }
    if (input.queueRejectedTotal > 0) {
        reasons.push(`queue backpressure rejections observed (${input.queueRejectedTotal})`);
    }
    if (input.telemetryFailuresTotal > 0) {
        reasons.push(`telemetry export failures observed (${input.telemetryFailuresTotal})`);
    }
    const violations = checkPerformanceBudgets(input.performance, input.budgets);
    for (const violation of violations) {
        reasons.push(`budget exceeded: ${violation.budget} observed=${violation.observed} limit=${violation.limit}`);
    }
    if (input.schedulerActive > 1 || violations.length >= 2 || input.queueRejectedTotal > 10) {
        return { level: 'critical', reasons: Object.freeze(reasons) };
    }
    if (reasons.length > 0)
        return { level: 'degraded', reasons: Object.freeze(reasons) };
    return { level: 'healthy', reasons: Object.freeze([]) };
};
//# sourceMappingURL=self-health.js.map