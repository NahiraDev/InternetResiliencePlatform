import { readFile, writeFile } from 'node:fs/promises';
import { NetworkDecisionEngine } from '../../packages/network-intelligence/dist/index.js';

const scenarioPath =
  process.argv.find((arg, index) => index > 1 && arg !== '--') ??
  'examples/phase-19/tunnel-failure.json';
const input = JSON.parse(await readFile(scenarioPath, 'utf8'));
const typeByScenario = input.scenario.includes('dns')
  ? 'dnsDecision'
  : input.scenario.includes('route')
    ? 'routeDecision'
    : input.scenario.includes('tunnel')
      ? 'tunnelDecision'
      : 'connectivityDecision';
const context = {
  timestamp: input.timestamp,
  versions: {
    policyVersion: 'demo-policy-v1',
    networkStateVersion: `demo-${input.scenario}`,
    securityStateVersion: 'demo-security-v1',
    routingStateVersion: 'demo-routing-v1',
    tunnelStateVersion: 'demo-tunnel-v1',
    dnsStateVersion: 'demo-dns-v1',
  },
  requiredCapabilities:
    typeByScenario === 'tunnelDecision'
      ? ['tunnel', 'encrypted']
      : typeByScenario === 'dnsDecision'
        ? ['dns']
        : typeByScenario === 'routeDecision'
          ? ['route']
          : ['internet'],
  candidates: input.candidates,
  historicalObservations: Object.fromEntries(
    input.candidates.map((c) => [
      c.id,
      [1, 2, 3, 4, 5].map((_, i) => ({
        timestamp: `2026-08-12T00:0${i}:00.000Z`,
        latencyMs: Math.max(1, (c.metrics.latencyMs ?? 50) * 0.9),
        availabilityRatio: c.metrics.availabilityRatio ?? 0.9,
        reliabilityRatio: c.metrics.reliabilityRatio ?? 0.9,
        uptimeRatio: c.metrics.reliabilityRatio ?? 0.9,
      })),
    ]),
  ),
};
const events = [];
const metrics = [];
const audit = [];
const engine = new NetworkDecisionEngine({
  events: { emit: (event, payload) => events.push({ event, payload }) },
  metrics: { record: (name, value, labels) => metrics.push({ name, value, labels }) },
  audit: { record: (event, payload) => audit.push({ event, payload }) },
});
const decision = await engine.simulateDecision({
  type: typeByScenario,
  context,
  now: input.timestamp,
});
const output = {
  phase: 19,
  timestamp: input.timestamp,
  scenario: input.scenario,
  decision,
  candidates: decision.candidates,
  confidence: decision.confidence,
  explanation: decision.explanation,
  policyValidation: decision.policyValidation,
  securityValidation: decision.securityValidation,
  fallbackUsed: decision.fallbackUsed,
  events: events.map((e) => e.event),
  metrics: metrics.map((m) => m.name),
  auditEvents: audit.map((a) => a.event),
};
await writeFile('examples/phase-19/phase19-result.json', JSON.stringify(output, null, 2));
console.log(
  JSON.stringify(
    {
      scenario: input.scenario,
      selectedCandidate: decision.selectedCandidate?.id ?? null,
      score: decision.score,
      confidence: decision.confidence,
      status: decision.status,
      resultPath: 'examples/phase-19/phase19-result.json',
    },
    null,
    2,
  ),
);
