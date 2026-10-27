/**
 * Failure/degradation fault catalog for issue #282.
 * Every fault maps to the observation evidence the canonical runtime already
 * understands; the lab never invents a parallel incident taxonomy.
 */

export type FaultKind =
  | 'interface-failure'
  | 'provider-failure'
  | 'gateway-failure'
  | 'dns-failure'
  | 'route-failure'
  | 'tunnel-failure'
  | 'destination-failure'
  | 'latency-degradation'
  | 'jitter-degradation'
  | 'packet-loss'
  | 'throughput-degradation'
  | 'provider-switch'
  | 'path-change'
  | 'failure-domain-change'
  | 'federation-loss'
  | 'stale-decision'
  | 'concurrent-plans'
  | 'policy-change'
  | 'verification-failure'
  | 'rollback-failure';

export interface FaultSpec {
  readonly kind: FaultKind;
  /** Observation category emitted for this fault. */
  readonly category: string;
  /** Observation status emitted for this fault. */
  readonly status: 'failed' | 'degraded' | 'stale' | 'healthy';
  /** Extra observation metadata (deterministic; derived from the seed). */
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

const failure = (kind: FaultKind, category: string): FaultSpec => ({
  kind,
  category,
  status: 'failed',
});

export const FAULT_CATALOG: Readonly<Record<FaultKind, FaultSpec>> = Object.freeze({
  'interface-failure': failure('interface-failure', 'connectivity'),
  'provider-failure': failure('provider-failure', 'provider'),
  'gateway-failure': failure('gateway-failure', 'gateway'),
  'dns-failure': failure('dns-failure', 'dns'),
  'route-failure': failure('route-failure', 'routing'),
  'tunnel-failure': failure('tunnel-failure', 'tunnel'),
  'destination-failure': failure('destination-failure', 'destination'),
  'latency-degradation': {
    kind: 'latency-degradation',
    category: 'network',
    status: 'degraded',
    metadata: { metric: 'latency' },
  },
  'jitter-degradation': {
    kind: 'jitter-degradation',
    category: 'network',
    status: 'degraded',
    metadata: { metric: 'jitter' },
  },
  'packet-loss': {
    kind: 'packet-loss',
    category: 'network',
    status: 'degraded',
    metadata: { metric: 'loss' },
  },
  'throughput-degradation': {
    kind: 'throughput-degradation',
    category: 'network',
    status: 'degraded',
    metadata: { metric: 'throughput' },
  },
  'provider-switch': {
    kind: 'provider-switch',
    category: 'provider',
    status: 'degraded',
    metadata: { transition: 'switch' },
  },
  'path-change': {
    kind: 'path-change',
    category: 'routing',
    status: 'degraded',
    metadata: { transition: 'path' },
  },
  'failure-domain-change': {
    kind: 'failure-domain-change',
    category: 'connectivity',
    status: 'degraded',
    metadata: { transition: 'failure-domain' },
  },
  'federation-loss': {
    kind: 'federation-loss',
    category: 'federation',
    status: 'degraded',
    metadata: { advisory: true },
  },
  'stale-decision': {
    kind: 'stale-decision',
    category: 'decision',
    status: 'stale',
    metadata: { advisory: true },
  },
  'concurrent-plans': {
    kind: 'concurrent-plans',
    category: 'decision',
    status: 'degraded',
    metadata: { concurrent: true },
  },
  'policy-change': {
    kind: 'policy-change',
    category: 'policy',
    status: 'degraded',
    metadata: { transition: 'policy' },
  },
  'verification-failure': {
    kind: 'verification-failure',
    category: 'verification',
    status: 'failed',
  },
  'rollback-failure': {
    kind: 'rollback-failure',
    category: 'recovery',
    status: 'failed',
  },
});

export const faultKinds: readonly FaultKind[] = Object.freeze(
  Object.keys(FAULT_CATALOG) as FaultKind[],
);
