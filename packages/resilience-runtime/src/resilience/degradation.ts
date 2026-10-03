/**
 * Degradation matrix for issue #283.
 * Declares, per fault, whether the canonical loop may continue in local
 * autonomy and which fallback applies. Optional remote/AI/telemetry
 * outages must never halt local safety-preserving control.
 */

export type DegradationFault =
  | 'daemon-crash'
  | 'partial-startup'
  | 'stale-runtime-state'
  | 'corrupt-runtime-state'
  | 'database-outage'
  | 'telemetry-outage'
  | 'plugin-crash'
  | 'malformed-config'
  | 'interrupted-transaction'
  | 'ai-unavailable'
  | 'federation-unavailable'
  | 'analytics-unavailable';

export type DegradationVerdict = 'continue-local' | 'continue-degraded' | 'halt';

export interface DegradationDecision {
  readonly verdict: DegradationVerdict;
  readonly fallback: string;
  readonly reason: string;
}

const DECISIONS: Record<DegradationFault, DegradationDecision> = {
  'daemon-crash': {
    verdict: 'halt',
    fallback: 'process supervision must restart the daemon; no in-process recovery is possible',
    reason: 'a crashed process cannot supervise itself',
  },
  'partial-startup': {
    verdict: 'halt',
    fallback: 'fail startup fast with a readiness failure; never serve traffic half-initialized',
    reason: 'half-initialized control planes apply wrong policy',
  },
  'stale-runtime-state': {
    verdict: 'continue-degraded',
    fallback: 're-observe and re-validate before any mutation; treat cached state as advisory',
    reason: 'stale state is safe only when re-verified',
  },
  'corrupt-runtime-state': {
    verdict: 'halt',
    fallback: 'reset to a known-good snapshot; refuse mutations until reset completes',
    reason: 'corrupt state cannot support policy-checked mutation',
  },
  'database-outage': {
    verdict: 'continue-degraded',
    fallback: 'serve from memory stores; queue durable writes for replay after recovery',
    reason: 'local autonomy must survive persistence outages',
  },
  'telemetry-outage': {
    verdict: 'continue-local',
    fallback: 'keep local telemetry authoritative; count export failures as evidence only',
    reason: 'telemetry export is evidence, not control',
  },
  'plugin-crash': {
    verdict: 'continue-degraded',
    fallback: 'isolate the plugin at the host boundary; core loop continues without it',
    reason: 'plugins are never on the critical control path',
  },
  'malformed-config': {
    verdict: 'halt',
    fallback: 'reject startup/config reload with a precise validation error',
    reason: 'unknown configuration cannot be policy-checked',
  },
  'interrupted-transaction': {
    verdict: 'continue-degraded',
    fallback: 'roll back via the canonical safety kernel and re-plan from observed state',
    reason: 'interrupted mutations must be rolled back, never resumed blindly',
  },
  'ai-unavailable': {
    verdict: 'continue-local',
    fallback: 'decide with the deterministic planner; AI stays advisory-only',
    reason: 'AI is advisory and never required for safe control',
  },
  'federation-unavailable': {
    verdict: 'continue-local',
    fallback: 'decide from local observations; treat missing federated evidence as absent',
    reason: 'federation is advisory and fail-open by contract',
  },
  'analytics-unavailable': {
    verdict: 'continue-local',
    fallback: 'skip advisory enrichment; core observe-decide-apply-verify loop is unchanged',
    reason: 'analytics never gates safety-preserving control',
  },
};

export const evaluateDegradation = (fault: DegradationFault): DegradationDecision =>
  DECISIONS[fault];

export const degradationFaults: readonly DegradationFault[] = Object.freeze(
  Object.keys(DECISIONS) as DegradationFault[],
);
