# Phase 47 — Gateway Discovery & Health

## Status

**Implementation:** complete on `main` pending repository/CI verification.

**Verification:** pending. Phase 47 must not be marked complete until the Phase 46 prerequisite and the Phase 47 validation, typecheck, lint, tests and build gates are green.

## Objective

Add a provider-neutral discovery and health layer on top of the authoritative Phase 46 gateway registry. Discovery reconciles externally supplied gateway metadata without resurrecting retired inventory. Health evaluation converts bounded reachability and quality evidence into deterministic, explicit health states and scores.

## Scope

- Provider-neutral `GatewayDiscoverySource` contract.
- Bounded discovery reconciliation into the existing `GatewayRegistry`.
- Safe handling of newly discovered and already registered gateways.
- Explicit stale-gateway detection without implicit lifecycle mutation.
- Protection against rediscovering retired gateways.
- Deterministic health states: `healthy`, `degraded`, `unreachable`, `stale`, `unknown`.
- Deterministic quality scoring from latency and packet-loss evidence.
- Explicit insufficient-quality semantics: reachability without quality evidence is `unknown`, not healthy.
- Bounded health staleness policy.
- Hard per-probe timeout boundary.
- Validation of timestamps and measurement ranges.
- No route, DNS, tunnel or failover mutation.

## Non-goals

- Tunnel establishment or protocol implementation (Phases 48–50).
- Automatic gateway selection (Phase 51).
- Gateway failover (Phase 53).
- Fleet provisioning or upgrades (Phase 54).
- Gateway credentials or secret storage.
- Implicit network activation.

## Safety invariants

1. Discovery consumes an explicit source contract; it does not scan arbitrary networks.
2. A discovery refresh cannot resurrect a retired gateway.
3. Stale detection is observational and does not silently disable or retire a gateway.
4. Reachability alone never produces a healthy quality classification.
5. Health timestamps cannot be materially future-dated.
6. Latency and packet-loss inputs are bounded and validated.
7. Every health probe has a hard timeout boundary.
8. Health evaluation is deterministic for the same evidence and policy.
9. Health code does not mutate routes, DNS, tunnels or failover state.
10. Gateway identity and lifecycle remain owned by the Phase 46 registry.

## Acceptance tests

- Discovered gateways are registered through the existing registry contract.
- Existing gateways are reconciled without changing identity or lifecycle implicitly.
- Retired gateways are rejected rather than resurrected.
- Previously known but undiscovered gateways are reported stale after the configured bound.
- Reachable low-latency/low-loss gateways are classified healthy.
- Poor but reachable gateways are classified degraded with a deterministic score.
- Unreachable gateways are classified unreachable with score zero.
- Stale evidence is classified stale with score zero.
- Reachability without quality evidence is classified unknown.
- Invalid timestamps and measurement ranges are rejected.
- A hanging health probe terminates through the hard timeout boundary.

## Verification gate

Run from a clean checkout:

```bash
pnpm install --frozen-lockfile
pnpm validate
pnpm validate:docs
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

For networking/runtime CI, retain the repository's applicable Docker/runtime and external regional validation gates. Phase completion requires green CI and no new repository validation failures.

## Architectural boundary

Phase 47 extends the Phase 46 inventory contract but remains decision-support infrastructure. It produces evidence and deterministic health classifications. Selection, tunnel execution, failover and routing remain later concerns.
