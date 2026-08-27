# Phase 51 — Automatic Gateway Selection

## Status

**Complete / verified.** Implementation, repository validation, typecheck, lint, tests, coverage, build, deterministic smoke tests, production Docker runtime smoke tests, and CI are green on `main`.

## Verification evidence

- Commit: `ec6daceb56f98f9dff84bafe1d9cf20532c30a61`
- CI run: `33104741177` (`CI #770`) — successful.
- CI validation job: `98631462114` — successful.
- Required repository gates passed: repository integrity, documentation integrity, lint, typecheck, test, fresh coverage, build, deterministic smoke test, and production Docker runtime smoke test.
- CodeQL for the same commit: successful.
- Docker Publish for the same commit: successful.
- Datadog Synthetics for the same commit: successful.

The separate Public Runtime Lab run associated with an earlier commit was cancelled; it is not a Phase 51 acceptance dependency because gateway selection is deliberately side-effect free and does not establish tunnels or mutate networking state.

## Contract

Select the best authorized gateway from current registry inventory using policy, health, capacity, and stability evidence without mutating networking state.

## Scope

- consume the canonical gateway inventory and health contracts;
- accept explicit selection policy constraints;
- reject gateways that are not active and trusted;
- reject stale, unreachable, unknown, or policy-disallowed health evidence;
- enforce latency and packet-loss limits;
- enforce capacity utilization limits when capacity evidence is available;
- enforce region, provider, tag, tunnel-protocol, and address-family constraints;
- calculate a bounded deterministic score from health, quality, capacity, and preferences;
- apply hysteresis to avoid unnecessary gateway switching;
- provide deterministic tie-breaking;
- return rejection reasons, score components, and human-readable explanations;
- remain side-effect free: no tunnel creation, route changes, DNS changes, or failover actions.

## Safety boundaries

Selection is a decision primitive, not an actuator. Phase 51 does not establish tunnels, mutate routes, modify DNS, or perform automatic failover. Those actions belong to later phases and must consume an explicit policy-checked selection result.

Only gateways with `lifecycle=active` and `trust=trusted` are eligible. Health evidence must satisfy the configured freshness and quality bounds. A current gateway is retained unless a challenger exceeds it by the configured hysteresis threshold.

## Acceptance criteria

1. Health and capacity evidence are validated before selection.
2. Policy-ineligible gateways are rejected with explicit reasons.
3. Selection never relies on stale health evidence when freshness is required.
4. Scores are bounded to 0–100 and deterministic for equivalent inputs.
5. Hysteresis prevents score churn from causing unnecessary switches.
6. Ties resolve deterministically by gateway ID.
7. Inputs are not mutated.
8. No network, tunnel, DNS, filesystem, or process side effects occur.
9. Normal, boundary, invalid, and failure-path tests cover the contract.
10. `pnpm validate`, `pnpm typecheck`, `pnpm lint`, relevant tests/builds, and CI pass.

## Dependencies

- Phase 46 — Gateway Registry
- Phase 47 — Gateway Discovery & Health
- Phase 48 — Secure Tunnel Abstraction (contract boundary only)
- Phase 49 — WireGuard Provider (not invoked by selection)
- Phase 50 — Additional Tunnel Providers (not invoked by selection)

## Explicit non-goals

- tunnel lifecycle automation (Phase 52);
- multi-gateway failover (Phase 53);
- fleet operations (Phase 54);
- gateway security/supply-chain hardening (Phase 55).
