/**
 * State classification for issue #281 (issue #272 Section J, task 2).
 *
 * Six state classes with genuinely different lifecycles. Treating them uniformly
 * is the failure this prevents: putting ephemeral runtime state in the database
 * makes local recovery depend on DB availability, while putting security state
 * in memory loses it on restart.
 *
 * The `criticalPath` flag is the important one: only ephemeral state may be
 * required to keep local safe control working.
 */

import { deepFreeze } from '../domain/ids.js';

export const STATE_CLASSES = [
  'ephemeral-runtime',
  'persistent-operational',
  'historical',
  'analytics',
  'configuration',
  'security',
] as const;

export type StateClass = (typeof STATE_CLASSES)[number];

export interface StateClassSpec {
  readonly stateClass: StateClass;
  /** Durable across restart. */
  readonly durable: boolean;
  /** Required for local safe control to continue. Never true except for ephemeral. */
  readonly criticalPath: boolean;
  /** Default retention in ms; `undefined` means retain indefinitely. */
  readonly retentionMs?: number;
  /** Whether the state may contain personal or sensitive payload. */
  readonly mayContainSensitivePayload: boolean;
  readonly description: string;
}

export const STATE_CLASS_SPECS: readonly StateClassSpec[] = Object.freeze([
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
    criticalPath: true,
    mayContainSensitivePayload: true,
    description: 'Security state: trust levels, denials, quarantine. Must survive restart; must never contain raw secrets.',
  }),
]);

export const specFor = (stateClass: StateClass): StateClassSpec =>
  STATE_CLASS_SPECS.find((spec) => spec.stateClass === stateClass) ?? STATE_CLASS_SPECS[0]!;

/**
 * Only ephemeral runtime state may be treated as a hard dependency. Anything
 * else must degrade rather than disable local control.
 */
export const mayBlockLocalControl = (stateClass: StateClass): boolean =>
  specFor(stateClass).criticalPath;

export interface StateAuditFinding {
  readonly stateClass: StateClass;
  readonly severity: 'MINOR' | 'MAJOR';
  readonly issue: string;
  readonly fix: string;
}

export interface StateAuditResult {
  readonly classified: Readonly<Record<string, StateClass>>;
  readonly findings: readonly StateAuditFinding[];
  readonly unclassified: readonly string[];
}

/**
 * Audits state placement: anything marked critical-path while also being
 * durable (or an analytics aggregate marked critical) is a design error, because
 * it implies local control depends on infrastructure.
 */
export const auditStatePlacement = (input: {
  readonly assignments: Readonly<Record<string, StateClass>>;
  /** State that must work with every optional dependency offline. */
  readonly mustWorkOffline?: readonly string[];
}): StateAuditResult => {
  const findings: StateAuditFinding[] = [];
  const unclassified: string[] = [];

  for (const [name, stateClass] of Object.entries(input.assignments)) {
    const spec = specFor(stateClass);
    if (input.mustWorkOffline?.includes(name) && !spec.criticalPath) {
      findings.push({
        stateClass,
        severity: 'MAJOR',
        issue: `'${name}' must work offline but is classified '${stateClass}', which is not critical-path`,
        fix: 'Classify as ephemeral-runtime, or guarantee an in-memory fallback path.',
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