/**
 * Failure/degradation fault catalog for issue #282.
 * Every fault maps to the observation evidence the canonical runtime already
 * understands; the lab never invents a parallel incident taxonomy.
 */
const failure = (kind, category) => ({
    kind,
    category,
    status: 'failed',
});
export const FAULT_CATALOG = Object.freeze({
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
export const faultKinds = Object.freeze(Object.keys(FAULT_CATALOG));
//# sourceMappingURL=faults.js.map