import { NetworkDecisionEngine } from '../../packages/network-intelligence/dist/index.js';

const timestamp = new Date().toISOString();

const candidates = [
  {
    id: 'primary',
    type: 'connectivity-source',
    capabilities: ['internet'],
    health: 'degraded',
    metrics: { latencyMs: 180, availabilityRatio: 0.55, reliabilityRatio: 0.6 },
    policyCompatibility: true,
    securityCompatibility: true,
    timestamp,
  },
  {
    id: 'secondary',
    type: 'connectivity-source',
    capabilities: ['internet'],
    health: 'healthy',
    metrics: { latencyMs: 65, availabilityRatio: 0.98, reliabilityRatio: 0.97 },
    policyCompatibility: true,
    securityCompatibility: true,
    timestamp,
  },
];

const context = {
  timestamp,
  versions: {
    policyVersion: 'example-v1',
    networkStateVersion: 'example-network-v1',
    securityStateVersion: 'example-security-v1',
    routingStateVersion: 'example-routing-v1',
    tunnelStateVersion: 'example-tunnel-v1',
    dnsStateVersion: 'example-dns-v1',
  },
  requiredCapabilities: ['internet'],
  candidates,
  historicalObservations: Object.fromEntries(
    candidates.map((candidate) => [candidate.id, [
      {
        timestamp: candidate.timestamp,
        latencyMs: candidate.metrics.latencyMs,
        availabilityRatio: candidate.metrics.availabilityRatio,
        reliabilityRatio: candidate.metrics.reliabilityRatio,
        uptimeRatio: candidate.metrics.reliabilityRatio,
      },
    ]]),
  ),
};

const engine = new NetworkDecisionEngine({
  events: { emit() {} },
  metrics: { record() {} },
  audit: { record() {} },
});

const decision = await engine.simulateDecision({
  type: 'connectivityDecision',
  context,
  now: context.timestamp,
});

console.log(JSON.stringify({
  selectedCandidate: decision.selectedCandidate?.id ?? null,
  score: decision.score,
  confidence: decision.confidence,
  status: decision.status,
  policyValidation: decision.policyValidation,
  securityValidation: decision.securityValidation,
  applied: false,
}, null, 2));
