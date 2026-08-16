import type { Observation, ObservationProviderResult, RuntimeContext } from './domain/types.js';
import type { ObservationProvider } from './ports/ports.js';
import { nextId, nowIso } from './domain/ids.js';
export class ObservationProviderRegistry {
  private readonly providers = new Map<string, ObservationProvider>();
  register(provider: ObservationProvider) {
    this.providers.set(provider.id, provider);
  }
  list() {
    return [...this.providers.values()];
  }
  async collect(context: RuntimeContext) {
    return Promise.all(
      this.list().map((p) =>
        p.collect(context).catch((e: unknown): ObservationProviderResult => ({
          providerId: p.id,
          collectedAt: nowIso(),
          errors: [e instanceof Error ? e.message : 'provider failed'],
          observations: [observation(p.id, p.id, 'provider_error', 'failed', String(e))],
        })),
      ),
    );
  }
}
export const observation = (
  source: string,
  category: string,
  metric: string,
  status: Observation['status'] = 'unknown',
  value: unknown = null,
): Observation => ({
  id: nextId('obs'),
  schemaVersion: 1,
  createdAt: nowIso(),
  source,
  metadata: {},
  category,
  metric,
  value,
  timestamp: nowIso(),
  freshnessMs: 0,
  confidence: status === 'unknown' ? 0 : 0.8,
  severity:
    status === 'healthy'
      ? 'info'
      : status === 'degraded' || status === 'stale'
        ? 'warning'
        : 'critical',
  status,
});
export class TruthfulObservationProvider implements ObservationProvider {
  constructor(
    readonly id: string,
    private readonly category: string,
    private readonly status: Observation['status'] = 'unknown',
  ) {}
  async collect(): Promise<ObservationProviderResult> {
    return {
      providerId: this.id,
      collectedAt: nowIso(),
      errors: [],
      observations: [observation(this.id, this.category, 'health', this.status)],
    };
  }
}
export const createDefaultObservationProviderRegistry = () => {
  const r = new ObservationProviderRegistry();
  for (const [id, cat] of [
    ['connectivity', 'connectivity'],
    ['network-intelligence', 'network'],
    ['routing', 'routing'],
    ['dns', 'dns'],
    ['tunnel', 'tunnel'],
    ['failover', 'failover'],
    ['security', 'security'],
    ['plugin', 'plugin'],
    ['telemetry', 'telemetry'],
  ] as const)
    r.register(new TruthfulObservationProvider(id, cat, 'unknown'));
  return r;
};
