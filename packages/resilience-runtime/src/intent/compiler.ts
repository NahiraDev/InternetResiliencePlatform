import { isIntentEffective, type NetworkIntent } from '@irp/core';

export type IntentObjective =
  | 'reachability'
  | 'latency'
  | 'jitter'
  | 'packetLoss'
  | 'throughput'
  | 'reliability'
  | 'privacy'
  | 'trust'
  | 'cost'
  | 'diversity';

export interface CompiledIntent {
  readonly intentId: string;
  readonly version: number;
  readonly priority: NetworkIntent['priority'];
  readonly desiredOutcome: string;
  readonly target: Readonly<Record<string, string>>;
  readonly constraints: Readonly<Record<string, string | number | boolean>>;
  readonly objectives: Readonly<Record<IntentObjective, number>>;
  readonly confidence: number;
  readonly provenance: 'network-intent';
  readonly compiledAt: string;
}

const OBJECTIVES: readonly IntentObjective[] = [
  'reachability',
  'latency',
  'jitter',
  'packetLoss',
  'throughput',
  'reliability',
  'privacy',
  'trust',
  'cost',
  'diversity',
];

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

const normalizedRecord = <T extends string | number | boolean>(
  input: Readonly<Record<string, T>> | undefined,
): Readonly<Record<string, T>> =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(input ?? {})
        .map(([key, value]) => [key.trim(), value] as const)
        .filter(([key]) => key.length > 0),
    ) as Record<string, T>,
  );

const defaultsFor = (outcome: string): Record<IntentObjective, number> => {
  const text = outcome.toLowerCase();
  const result: Record<IntentObjective, number> = {
    reachability: 0.3,
    latency: 0.1,
    jitter: 0.05,
    packetLoss: 0.05,
    throughput: 0.1,
    reliability: 0.2,
    privacy: 0.05,
    trust: 0.05,
    cost: 0.05,
    diversity: 0.05,
  };
  if (/low latency|latency|responsive|ssh/.test(text)) result.latency += 0.2;
  if (/video|conference|jitter|real.?time/.test(text)) {
    result.jitter += 0.2;
    result.packetLoss += 0.15;
  }
  if (/download|throughput|bandwidth/.test(text)) result.throughput += 0.25;
  if (/private|privacy|sensitive|trusted/.test(text)) {
    result.privacy += 0.2;
    result.trust += 0.2;
  }
  if (/diverse|independent|restricted|reach/.test(text)) {
    result.reachability += 0.15;
    result.diversity += 0.15;
  }
  const total = Object.values(result).reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(
    OBJECTIVES.map((objective) => [objective, clamp(result[objective] / total)]),
  ) as Record<IntentObjective, number>;
};

const explicitObjective = (constraints: Readonly<Record<string, string | number | boolean>>) => {
  const objectives = defaultsFor('');
  for (const objective of OBJECTIVES) {
    const value = constraints[`objective.${objective}`] ?? constraints[objective];
    if (typeof value === 'number' && Number.isFinite(value)) objectives[objective] = clamp(value);
  }
  const total = Object.values(objectives).reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(
    OBJECTIVES.map((objective) => [objective, clamp(objectives[objective] / total)]),
  ) as Record<IntentObjective, number>;
};

/**
 * Converts a declarative, active NetworkIntent into bounded runtime inputs.
 * This function only compiles evidence/constraints; it cannot authorize or
 * execute a network mutation.
 */
export const compileNetworkIntent = (intent: NetworkIntent, at = new Date()): CompiledIntent => {
  if (!isIntentEffective(intent, at))
    throw new Error(`Network intent ${intent.id} is not active in the requested time window`);
  const constraints = normalizedRecord(intent.spec.constraints);
  return Object.freeze({
    intentId: intent.id,
    version: intent.version,
    priority: intent.priority,
    desiredOutcome: intent.spec.outcome.trim(),
    target: normalizedRecord<string>(intent.spec.target),
    constraints,
    objectives: Object.freeze(
      Object.keys(constraints).some(
        (key) => key.startsWith('objective.') || OBJECTIVES.includes(key as IntentObjective),
      )
        ? explicitObjective(constraints)
        : defaultsFor(intent.spec.outcome),
    ),
    confidence: 1,
    provenance: 'network-intent' as const,
    compiledAt: at.toISOString(),
  });
};
