# Phase 53 — Multi-Gateway Failover

## Status

**Implementation started; repository verification required.**

Phase 53 adds a bounded, provider-neutral multi-gateway failover coordinator on top of the canonical gateway inventory, health and selection contracts. It does not create a second gateway registry, routing engine or tunnel lifecycle.

## Implementation

- `packages/gateway-registry/src/failover.ts`
- `packages/gateway-registry/src/failover.test.ts`
- exported from `packages/gateway-registry/src/index.ts`

The coordinator consumes `selectGateway(...)` for policy/trust/lifecycle/health/capacity eligibility and delegates the actual switch to a caller-supplied executor. This keeps route/DNS/platform mutations outside the gateway selection domain.

## Contract

```text
current gateway degraded/unreachable
            ↓
     policy + evidence check
            ↓
 deterministic candidate ranking
            ↓
 bounded gateway switch
            ↓
 post-switch verification
       ↙            ↘
   success         failure
     ↓                ↓
 selected       quarantine candidate
                      ↓
                 next candidate
```

## Safety properties

- Failover is serialized; concurrent operations on one coordinator are rejected.
- Current healthy/degraded gateways are not automatically displaced when `requireCurrentUnhealthy` is enabled.
- Candidate eligibility is delegated to the canonical Phase 51 selection policy, including lifecycle, trust, health freshness, health score, latency, packet loss, capacity and explicit policy constraints.
- The current gateway is excluded from failover candidates.
- Previously failed candidates can be supplied explicitly through `failedGatewayIds` and failed switch targets are quarantined for a bounded cooldown.
- Failover attempts are capped at 1–10 and candidates are attempted in the deterministic score order returned by the gateway selector.
- A candidate is considered successful only after the executor reports post-switch verification as healthy.
- A failed or unverified candidate is not selected as the result and is quarantined before the next attempt.
- The coordinator does not directly mutate routes, DNS, tunnel state or platform networking.
- Gateway and health inputs are treated as read-only.
- Telemetry contains gateway identifiers, attempt metadata and failure reasons only; no credential/secret contract is introduced.
- The executor contract requires switch execution to be atomic with respect to exceptions: if `switchGateway` throws, the active gateway must remain unchanged.

## Tests

`failover.test.ts` covers:

1. failover to the highest-ranked eligible gateway with verification;
2. failed candidate quarantine and progression to the next candidate;
3. refusal to switch away from a still-healthy current gateway;
4. deterministic bounded exhaustion when candidates fail;
5. concurrent operation rejection;
6. input immutability and quarantine clearing.

## Acceptance criteria

- [x] Multi-gateway failover coordinator exists in the canonical gateway domain.
- [x] Phase 51 selection remains the sole candidate eligibility/ranking primitive.
- [x] Failover is bounded and deterministic.
- [x] Candidate switching requires post-switch verification.
- [x] Failed candidates are quarantined for a bounded cooldown.
- [x] Concurrent failover operations are rejected.
- [x] Normal, boundary and failure-path tests are present.
- [x] No route/DNS/tunnel abstraction is duplicated inside the coordinator.
- [ ] `pnpm validate` passes for the final Phase 53 commit.
- [ ] `pnpm typecheck` passes for the final Phase 53 commit.
- [ ] `pnpm lint` passes for the final Phase 53 commit.
- [ ] `@irp/gateway-registry` tests/build pass for the final Phase 53 commit.
- [ ] Required CI checks are green for the final Phase 53 commit.

## Explicit non-goals

- gateway fleet provisioning and maintenance (Phase 54);
- gateway security and supply-chain hardening (Phase 55);
- Web Control Center UI (Phase 57);
- direct route/DNS mutation;
- provider-specific tunnel lifecycle logic.
