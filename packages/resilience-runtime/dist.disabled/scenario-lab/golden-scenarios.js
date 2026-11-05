/**
 * Canonical golden scenarios for issue #284 (issue #272 Section M).
 *
 * These were previously defined ad hoc inside two test files with duplicated
 * helpers and non-deterministic inputs (`new Date().toISOString()`). Defining
 * them here makes the scenario set a single registry that is executable evidence
 * rather than a claim, and gives every scenario a stable seed so replay is
 * reproducible.
 */
const fullAuthority = [
    'dns_switch',
    'route_change',
    'connectivity_failover',
    'tunnel_switch',
    'provider_switch',
    'recovery',
    'health_reprobe',
    'noop',
];
const readonlyAuthority = ['health_reprobe', 'noop'];
const scenario = (name, seed, steps, allowedActions = fullAuthority) => Object.freeze({
    schemaVersion: 1,
    name,
    seed,
    steps: Object.freeze(steps.map((step) => Object.freeze(step))),
    allowedActions: Object.freeze([...allowedActions]),
});
/** Every golden scenario required by the #272 Section M checklist. */
export const GOLDEN_SCENARIOS = Object.freeze([
    scenario('healthy', 'seed-healthy', [{ cycles: 2 }]),
    scenario('dns-degradation', 'seed-dns-degradation', [
        {},
        { fault: 'dns-failure', cycles: 2 },
        {},
    ]),
    scenario('provider-degradation', 'seed-provider-degradation', [
        {},
        { fault: 'provider-failure', cycles: 2 },
        { fault: 'latency-degradation' },
        {},
    ]),
    scenario('gateway-failure', 'seed-gateway-failure', [
        {},
        { fault: 'gateway-failure', cycles: 2 },
    ]),
    scenario('tunnel-failure', 'seed-tunnel-failure', [
        {},
        { fault: 'tunnel-failure', cycles: 2 },
    ]),
    scenario('restricted-destination', 'seed-restricted-destination', [
        { fault: 'destination-failure', cycles: 2 },
    ]),
    scenario('prediction', 'seed-prediction', [
        { fault: 'latency-degradation' },
        { fault: 'jitter-degradation' },
        {},
    ]),
    scenario('federation-loss', 'seed-federation-loss', [
        {},
        // Federation evidence disappears while local control must continue.
        { fault: 'federation-loss', cycles: 2 },
        {},
    ]),
    scenario('concurrency-race', 'seed-concurrency-race', [
        {},
        // Two plans contending for the same resource, then a stale decision.
        { fault: 'concurrent-plans', cycles: 2 },
        { fault: 'stale-decision' },
    ]),
    scenario('verification-failure', 'seed-verification-failure', [
        {},
        { fault: 'verification-failure', cycles: 2 },
        { fault: 'rollback-failure' },
        {},
    ]),
    scenario('policy-change', 'seed-policy-change', [
        {},
        { fault: 'policy-change', cycles: 2 },
    ], readonlyAuthority),
]);
export const goldenScenario = (name) => GOLDEN_SCENARIOS.find((entry) => entry.name === name);
export const GOLDEN_SCENARIO_NAMES = Object.freeze(GOLDEN_SCENARIOS.map((entry) => entry.name));
//# sourceMappingURL=golden-scenarios.js.map