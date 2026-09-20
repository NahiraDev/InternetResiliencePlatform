import type { CompiledIntent } from './compiler.js';
import type { RuntimeContext, RuntimeMode } from '../domain/types.js';

export type IntentAdmission = 'ALLOW' | 'PLAN_ONLY' | 'REQUIRE_APPROVAL' | 'DENY';

export interface IntentGovernanceDecision {
  readonly admission: IntentAdmission;
  readonly selectedIntent?: CompiledIntent;
  readonly candidates: readonly CompiledIntent[];
  readonly rejectedIntents: readonly CompiledIntent[];
  readonly reasons: readonly string[];
  readonly mutationAllowed: boolean;
  readonly maxRisk: number;
}

const PRIORITY: Readonly<Record<CompiledIntent['priority'], number>> = {
  low: 1,
  normal: 2,
  high: 3,
  critical: 4,
};

const AUTONOMY: Readonly<Record<NonNullable<CompiledIntent['autonomy']>, number>> = {
  OBSERVE_ONLY: 0,
  ADVISORY: 1,
  SAFE_AUTOMATION: 2,
  AUTONOMOUS: 3,
  HIGH_RISK_REQUIRES_APPROVAL: 1,
};

const specificity = (intent: CompiledIntent): number =>
  Object.keys(intent.scope).filter((key) => key !== 'intentId').length;

const compare = (a: CompiledIntent, b: CompiledIntent): number =>
  PRIORITY[b.priority] - PRIORITY[a.priority] ||
  b.confidence - a.confidence ||
  AUTONOMY[b.autonomy ?? 'ADVISORY'] - AUTONOMY[a.autonomy ?? 'ADVISORY'] ||
  specificity(b) - specificity(a) ||
  a.intentId.localeCompare(b.intentId);

const overlappingScope = (a: CompiledIntent, b: CompiledIntent): boolean => {
  const aEntries = Object.entries(a.scope).filter(([key]) => key !== 'intentId');
  const bScope = new Map(Object.entries(b.scope));
  return aEntries.some(([key, value]) => bScope.get(key) === value);
};

const modeAllowsMutation = (mode: RuntimeMode): boolean => mode === 'live';

export const arbitrateIntents = (
  intents: readonly CompiledIntent[],
): {
  selectedIntent?: CompiledIntent;
  candidates: readonly CompiledIntent[];
  rejectedIntents: readonly CompiledIntent[];
} => {
  const candidates = [...intents].sort(compare);
  if (!candidates.length) return { candidates: [], rejectedIntents: [] };

  const selectedIntent = candidates[0];
  if (!selectedIntent) return { candidates: [], rejectedIntents: [] };

  const rejectedIntents = candidates
    .slice(1)
    .filter((intent) => overlappingScope(selectedIntent, intent));

  return { selectedIntent, candidates, rejectedIntents };
};

export const resolveIntentGovernance = (
  intents: readonly CompiledIntent[],
  context: RuntimeContext,
): IntentGovernanceDecision => {
  const arbitration = arbitrateIntents(intents);
  if (!arbitration.selectedIntent) {
    return {
      admission: 'ALLOW',
      candidates: [],
      rejectedIntents: [],
      reasons: ['no compiled intent supplied; preserve existing runtime behavior'],
      mutationAllowed: true,
      maxRisk: 1,
    };
  }

  const selected = arbitration.selectedIntent;
  const reasons: string[] = [];
  const trusted = context.securityContext.trusted && context.capabilitySnapshot.trusted;

  if (context.policySnapshot.policy.failClosed && !trusted)
    reasons.push('intent governance requires trusted security and capability context');

  let admission: IntentAdmission = 'ALLOW';
  let mutationAllowed = modeAllowsMutation(context.mode);
  let maxRisk = 0.75;

  if (selected.autonomy === 'OBSERVE_ONLY') {
    admission = 'PLAN_ONLY';
    mutationAllowed = false;
    maxRisk = 0;
    reasons.push('intent autonomy is observe-only');
  } else if (
    selected.autonomy === 'ADVISORY' ||
    selected.autonomy === 'HIGH_RISK_REQUIRES_APPROVAL'
  ) {
    admission = 'REQUIRE_APPROVAL';
    mutationAllowed = false;
    maxRisk = selected.autonomy === 'HIGH_RISK_REQUIRES_APPROVAL' ? 0 : 0.25;
    reasons.push(`intent autonomy requires approval: ${selected.autonomy}`);
  } else if (selected.autonomy === 'SAFE_AUTOMATION') {
    maxRisk = 0.5;
    if (selected.confidence < context.policySnapshot.policy.confidenceThreshold) {
      admission = 'REQUIRE_APPROVAL';
      mutationAllowed = false;
      reasons.push('intent confidence is below policy threshold');
    }
  }

  if (!trusted && selected.autonomy !== 'OBSERVE_ONLY') {
    admission = 'DENY';
    mutationAllowed = false;
    reasons.push('untrusted execution context');
  }

  if (!modeAllowsMutation(context.mode)) {
    mutationAllowed = false;
    if (admission === 'ALLOW') admission = 'PLAN_ONLY';
    reasons.push(`runtime mode ${context.mode} does not permit live mutation`);
  }

  if (arbitration.rejectedIntents.length)
    reasons.push(
      `arbitrated ${arbitration.rejectedIntents.length} lower-priority overlapping intent(s)`,
    );

  return Object.freeze({
    admission,
    selectedIntent: selected,
    candidates: arbitration.candidates,
    rejectedIntents: arbitration.rejectedIntents,
    reasons,
    mutationAllowed,
    maxRisk,
  });
};
