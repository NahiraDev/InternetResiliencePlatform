import { NetworkDecisionEngine } from '../../packages/network-intelligence/dist/index.js';

const candidates = [
  {
    id: 'primary',
    metrics: { latencyMs: 180, availabilityRatio: 0.55, reliabilityRatio: 0.6 },
  },
  {
    id: 'secondary',
    metrics: { latencyMs: 65, availabilityRatio: 0.98, reliabilityRatio: 0.97 },
  },
];

const context = {
  timestamp: new Date().toISOString(),
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
    candidates.map((candidate) => [candidate.id, [candidate].map((item) => ({
      timestamp: contextTimestamp(),
      latencyMs: item.metrics.latencyMs,
      availabilityRatio: item.metrics.availabilityRatio,
      reliabilityRatio: item.metrics.reliabilityRatio,
      uptimeRatio: item.metrics.reliabilityRatio,
    }))]),
  ),
};

function contextTimestamp() {
  return new Date().toISOString();
}

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
