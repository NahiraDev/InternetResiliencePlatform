import { deepFreeze, nextId, nowIso } from '../domain/ids.js';
import type {
  Observation,
  ObservationBatch,
  ObservationProviderResult,
  RuntimeContext,
} from '../domain/types.js';
import type { ObservationProvider } from '../ports/ports.js';
export const normalizeObservation = (input: Observation, context: RuntimeContext): Observation => {
  const freshnessMs =
    Date.parse(context.policySnapshot.createdAt) >= 0
      ? Date.now() - Date.parse(input.timestamp)
      : input.freshnessMs;
  const stale = freshnessMs > context.policySnapshot.policy.telemetryFreshnessMs;
  return deepFreeze({
    ...input,
    freshnessMs: Math.max(0, freshnessMs),
    status: stale ? 'stale' : input.status,
    confidence: Math.max(0, Math.min(1, input.confidence)),
    metadata: input.metadata ?? {},
  });
};
export class ObservationAggregator {
  constructor(private readonly providers: readonly ObservationProvider[]) {}
  async collect(context: RuntimeContext): Promise<ObservationBatch> {
    const results: ObservationProviderResult[] = await Promise.all(
      this.providers.map((p) => p.collect(context)),
    );
    const observations = results
      .flatMap((r) => r.observations)
      .map((o) => normalizeObservation(o, context))
      .sort((a, b) =>
        `${a.source}:${a.category}:${a.metric}`.localeCompare(
          `${b.source}:${b.category}:${b.metric}`,
        ),
      );
    return deepFreeze({
      id: nextId('obsbatch'),
      schemaVersion: 1,
      createdAt: nowIso(),
      correlationId: context.correlationId,
      source: 'resilience-runtime',
      metadata: { providerCount: this.providers.length, errors: results.flatMap((r) => r.errors) },
      observations,
      stale: observations.some((o) => o.status === 'stale'),
      minConfidence: observations.length ? Math.min(...observations.map((o) => o.confidence)) : 0,
    });
  }
}
export class StaticObservationProvider implements ObservationProvider {
  constructor(
    readonly id: string,
    private readonly observations: readonly Observation[],
  ) {}
  async collect(): Promise<ObservationProviderResult> {
    return {
      providerId: this.id,
      observations: this.observations,
      collectedAt: nowIso(),
      errors: [],
    };
  }
}
