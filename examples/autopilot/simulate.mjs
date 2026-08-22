import { NetworkDecisionEngine } from '../../packages/network-intelligence/dist/index.js';

const timestamp = new Date().toISOString();
const candidates = [
  { id: 'primary', metrics: { latencyMs: 160, availabilityRatio: 0.58, reliabilityRatio: 0.62 } },
  { id: 'secondary', metrics: { latencyMs: 70, availabilityRatio: 0.97, reliabilityRatio: 0.96 } },
];

const context = {
  timestamp,
  versions: {
    policyVersion: 'example-policy-v1',
    networkStateVersion: 'example-network-v1',
    securityStateVersion: 'example-security-v1',
    routingStateVersion: 'example-routing-v1',
    tunnelStateVersion: 'example-tunnel-v1',
    dnsStateVersion: 'example-dns-v1',
  },
  requiredCapabilities: ['internet'],
  candidates,
  historicalObservations: Object.fromEntries(
    candidates.map((candidate) => [
      candidate.id,
      [{
        timestamp,
        latencyMs: candidate.metrics.latencyMs,
        availabilityRatio: candidate.metrics.availabilityRatio,
        reliabilityRatio: candidate.metrics.reliabilityRatio,
        uptimeRatio: candidate.metrics.reliabilityRatio,
      }],
    ]),
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
  now: timestamp,
});

const output = {
  loop: [
    'observe',
    'measure',
    'detect',
    'diagnose',
    'decide',
    'policy-safety-check',
    'plan',
    'apply',
    'verify',
    'rollback-recovery',
    'telemetry',
  ],
  evidence: candidates,
  decision: {
    selectedCandidate: decision.selectedCandidate?.id ?? null,
    score: decision.score,
    confidence: decision.confidence,
    status: decision.status,
    policyValidation: decision.policyValidation,
    securityValidation: decision.securityValidation,
  },
  execution: {
    applied: false,
    reason: 'Example intentionally stops before host-network mutation.',
  },
};

console.log(JSON.stringify(output, null, 2));
