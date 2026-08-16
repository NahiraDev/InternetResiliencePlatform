import { deepFreeze, stableId, nowIso } from '../domain/ids.js';
import type { Incident, ObservationBatch, RuntimeContext } from '../domain/types.js';
export class IncidentCorrelator {
  async correlate(batch: ObservationBatch, context: RuntimeContext): Promise<readonly Incident[]> {
    const bad = batch.observations.filter((o) =>
      ['failed', 'degraded', 'stale'].includes(o.status),
    );
    if (!bad.length) return [];
    const security = bad.filter((o) => o.category === 'security');
    const mk = (
      key: string,
      obs = bad,
      cls: Incident['classification'] = 'primary_failure',
      reason = 'normalized evidence exceeded runtime thresholds',
    ): Incident =>
      deepFreeze({
        id: stableId('incident', `${context.correlationId}:${key}`),
        schemaVersion: 1,
        createdAt: nowIso(),
        correlationId: context.correlationId,
        source: 'resilience-runtime',
        metadata: {},
        rootCause: key,
        affectedComponents: [...new Set(obs.map((o) => o.category))].sort(),
        confidence: Math.min(
          1,
          obs.reduce((s, o) => s + o.confidence, 0) / Math.max(1, obs.length),
        ),
        evidence: obs.map((o) => o.id).sort(),
        correlationReason: reason,
        classification: cls,
      });
    if (security.length)
      return [
        mk(
          'security_failure',
          security,
          'security_failure',
          'security evidence fails closed and is not downgraded',
        ),
      ];
    const dns = bad.filter((o) => o.category === 'dns');
    const http = bad.filter((o) => o.category === 'http' || o.category === 'tls');
    if (dns.length && http.length)
      return [
        mk(
          'dns_failure',
          [...dns, ...http],
          'primary_failure',
          'DNS failure plausibly explains downstream HTTP/TLS reachability',
        ),
      ];
    const persistent = bad.filter((o) => o.metadata['persistent'] === true);
    if (persistent.length)
      return [
        mk(
          'persistent_degradation',
          persistent,
          'persistent_degradation',
          'provider marked degradation persistent',
        ),
      ];
    return bad.map((o) =>
      mk(
        `${o.category}_${o.metric}`,
        [o],
        'independent_failure',
        'no causal dependency was available',
      ),
    );
  }
}
