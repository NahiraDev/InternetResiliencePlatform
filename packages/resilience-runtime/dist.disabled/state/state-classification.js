/**
 * State classification for issue #281 (issue #272 Section J, task 2).
 *
 * Six state classes with genuinely different lifecycles. Treating them uniformly
 * is the failure this prevents: putting ephemeral runtime state in the database
 * makes local recovery depend on DB availability, while putting security state
 * in memory loses it on restart.
 *
 * The `criticalPath` flag is the important one: only ephemeral state may be
 * required to keep local safe control working. Durable security state must be
 * recoverable after restart, but local control must fail safe without it.
 */
import { deepFreeze } from '../domain/ids.js';
export const STATE_CLASSES = [
    'ephemeral-runtime',
    'persistent-operational',
    'historical',
    'analytics',
    'configuration',
    'security',
];
export const STATE_CLASS_SPECS = Object.freeze([
    Object.freeze({
        stateClass: 'ephemeral-runtime',
        durable: false,
        criticalPath: true,
        retentionMs: 3_600_000,
        mayContainSensitivePayload: false,
        description: 'In-process control state: current cycle, in-flight mutations, locks. Lost on restart by design.',
    }),
    Object.freeze({
        stateClass: 'persistent-operational',
        durable: true,
        criticalPath: false,
        mayContainSensitivePayload: false,
        description: 'Survives restart and is needed to resume cleanly: transactions, decisions, incidents, runtime state.',
    }),
    Object.freeze({
        stateClass: 'historical',
        durable: true,
        criticalPath: false,
        retentionMs: 90 * 24 * 60 * 60 * 1000,
        mayContainSensitivePayload: false,
        description: 'Retained for audit and reconstruction: evidence history, outcome records, failure memory.',
    }),
    Object.freeze({
        stateClass: 'analytics',
        durable: true,
        criticalPath: false,
        retentionMs: 365 * 24 * 60 * 60 * 1000,
        mayContainSensitivePayload: false,
        description: 'Derived aggregates for reporting. Recomputable, so safe to drop.',
    }),
    Object.freeze({
        stateClass: 'configuration',
        durable: true,
        criticalPath: false,
        mayContainSensitivePayload: false,
        description: 'Declared configuration and policy. Durable because losing it changes behaviour silently.',
    }),
    Object.freeze({
        stateClass: 'security',
        durable: true,
        criticalPath: false,
        mayContainSensitivePayload: true,
        description: 'Security state: trust levels, denials, quarantine. It must survive restart, but local control fails safe without it; it must never contain raw secrets.',
    }),
]);
export const specFor = (stateClass) => STATE_CLASS_SPECS.find((spec) => spec.stateClass === stateClass) ?? STATE_CLASS_SPECS[0];
/**
 * Only ephemeral runtime state may be treated as a hard dependency. Durable
 * state, including security state, must degrade or fail safe rather than
 * disable local control.
 */
export const mayBlockLocalControl = (stateClass) => specFor(stateClass).criticalPath;
/**
 * Audits state placement: durable state must not also be critical-path,
 * because that implies local control depends on infrastructure. Analytics must
 * additionally never block local control.
 */
export const auditStatePlacement = (input) => {
    const findings = [];
    const unclassified = [];
    for (const [name, stateClass] of Object.entries(input.assignments)) {
        if (!STATE_CLASSES.includes(stateClass)) {
            unclassified.push(name);
            findings.push({
                stateClass: 'ephemeral-runtime',
                severity: 'MAJOR',
                issue: `'${name}' is assigned to unknown state class '${stateClass}'`,
                fix: 'Assign one of the six canonical state classes.',
            });
            continue;
        }
        const spec = specFor(stateClass);
        if (input.mustWorkOffline?.includes(name) && !spec.criticalPath) {
            findings.push({
                stateClass,
                severity: 'MAJOR',
                issue: `'${name}' must work offline but is classified '${stateClass}', which is not critical-path`,
                fix: 'Classify as ephemeral-runtime, or guarantee an in-memory fallback path.',
            });
        }
        if (spec.durable && spec.criticalPath) {
            findings.push({
                stateClass,
                severity: 'MAJOR',
                issue: `'${name}' is durable and critical-path, so local control depends on restart-persistent infrastructure`,
                fix: 'Make it ephemeral, or provide a fail-safe local fallback and mark it non-critical.',
            });
        }
        if (spec.stateClass === 'analytics' && spec.criticalPath) {
            findings.push({
                stateClass,
                severity: 'MAJOR',
                issue: `'${name}' is analytics but marked critical-path`,
                fix: 'Analytics is recomputable and must never block local control.',
            });
        }
    }
    return deepFreeze({
        classified: Object.freeze({ ...input.assignments }),
        findings: Object.freeze(findings),
        unclassified: Object.freeze(unclassified),
    });
};
//# sourceMappingURL=state-classification.js.map