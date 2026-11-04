# Autonomous Capacity & Egress Provisioning (Proposed Capability)

> **Status: PLANNED — NOT IMPLEMENTED.**
>
> This document describes a **proposed** extension of the IRP superplatform. No part of the
> capability described here exists today in a production-ready form. Current repository
> state is tracked by [`PROJECT_STATE.md`](../../PROJECT_STATE.md) and
> [`docs/roadmap/MASTER_ROADMAP_V2.md`](../roadmap/MASTER_ROADMAP_V2.md); implementation
> status must always be read from source, tests and runtime evidence — never from this
> document.
>
> Tracking issue: [#463](https://github.com/NahiraDev/InternetResiliencePlatform/issues/463)
> (child workstream of epic [#272](https://github.com/NahiraDev/InternetResiliencePlatform/issues/272)).

---

## 1. Purpose and scope

IRP should evolve toward a **built-in, one-click connectivity provisioning capability**: a
user selects a bandwidth package (or desired capacity), activates it, and IRP discovers,
authorizes, acquires, secures, routes, verifies and maintains usable connectivity —
**without the user renting, configuring or maintaining a VPS or dedicated server**.

This is a native extension of the existing autonomous resource discovery, authorization,
planning, transactional execution, verification and recovery systems. It is explicitly
**not**:

- a conventional VPN reseller dashboard;
- a storefront for third-party VPN products;
- a wrapper, launcher or installer for third-party VPN applications.

"VPS-free" does not mean "infrastructure-free". Capacity must originate from legitimate,
authorized sources: provider APIs, authorized shared infrastructure, contractual partner
resources, explicitly enrolled community-operated gateways, or optional user-owned
infrastructure. The one-click flow must never require the latter.

### Target user experience

```
1. Open the IRP panel
2. Select a bandwidth package / desired capacity
3. Click Create / Activate
4. IRP discovers, authorizes, acquires, provisions, verifies
5. User receives a ready-to-use, securely managed connection
```

No manual VPS setup, server administration, third-party VPN installation, manual gateway
selection or network configuration.

---

## 2. Relationship to the canonical architecture

This capability **extends** the canonical superplatform contract; it does not introduce a
new architecture. The following constraints from
[`IRP-SUPERPLATFORM-REFERENCE-ARCHITECTURE.md`](IRP-SUPERPLATFORM-REFERENCE-ARCHITECTURE.md)
apply unchanged:

| Canonical constraint (reference) | How this capability complies |
| --- | --- |
| §3 one production mutation authority (`@irp/resilience-runtime`) | Acquisition, activation, allocation, teardown and replacement are executed only inside the canonical runtime transaction boundary. |
| §3 forbidden parallel authorities | No second control plane, decision engine, policy engine, safety kernel, state registry, **provider registry**, planner, scheduler, transaction executor or event bus. |
| §6 Connectivity Fabric resource model | Capacity is expressed as fabric resource attributes (`capacity`, `cost`, `ownership`, `trust`, `lifecycle`, failure domains) on existing `Provider` / `Gateway` / `Egress` / `RemoteNode` kinds — not as a parallel resource model. |
| §11 optimization model | `cost`, `capacity`, `trust` and `failure-domain` diversity become optimization inputs alongside latency/loss/reachability. |
| §12 planner and scheduler | Capacity allocation uses the runtime's reservation/epoch/TTL primitives; no separate capacity scheduler. |
| §13 transaction model | Order → allocate → activate → route → verify is transactional: prepare, snapshot, validate, policy, security, safety, apply, verify, commit, with rollback + rollback verification. |
| §14 outcome verification | Success is proven by real external destination verification through the provisioned path. |
| §18 federation | Remote/community resources are evidence and resource providers, never unrestricted authority; local autonomy survives their loss. |
| §19 security/trust | Provider-specific credentials stay inside provider adapters; community nodes require identity attestation and policy-bound authority. |
| §23 persistence model | Metering/entitlement state is operational state with explicit degradation behavior; database outage must not break local control. |
| §26 simulation / digital twin | Acquisition, quota exhaustion and provider failure are reproducible scenarios in the runtime lab. |

### Canonical owner map

| Concern | Canonical owner (must be extended, not replaced) |
| --- | --- |
| Runtime orchestration, planning, transaction, verification, recovery | `@irp/resilience-runtime` |
| Gateway lifecycle, capacity/fleet state, selection | `@irp/gateway-registry` |
| Tunnel lifecycle and credential reference | `@irp/tunnel` |
| Connectivity sources and local provider adapters | `@irp/connectivity` |
| Secret and key lifecycle | `@irp/security` + runtime key lifecycle |
| Data-plane shaping / QoS enforcement | runtime data-plane boundary |
| Panel / CLI / API / SDK surfaces | interface layers only (never privileged executors) |

---

## 3. Capability model

### 3.1 Acquisition models

Capacity may be obtained through several legitimate models. All of them normalize into
the same fabric resource shape, so selection, ranking and verification stay model-agnostic.

| Model | Description | Authority granted to IRP | Required evidence |
| --- | --- | --- | --- |
| **Provider API** | Provider exposes an order/allocate/activate API (hosted egress, VPN gateway, cellular slice, transit capacity). | Scoped to the ordered resource. | Provider credentials + provider response. |
| **Authorized shared infrastructure** | Capacity IRP is authorized (contractually or administratively) to use and meter. | Pre-agreed scope, quota-bound. | Authorization record + terms reference. |
| **Partner resources** | Contractual partner capacity with entitlement and SLA. | Entitlement-bound, tenant-scoped. | Partner agreement/entitlement record. |
| **Community-operated gateways** | Explicitly enrolled, identity-attested, trust-scored community egress nodes. | Narrow, policy-scoped, revocable. | Node identity + attestation + operator consent. |
| **User-owned infrastructure (optional)** | Gateway on hardware the user already owns. | User-scoped. | User enrollment flow. **Never a prerequisite.** |

Discovery of each model is *read-only metadata* until authorization and acquisition
succeed. This mirrors the existing rule in the capability directory: discovery grants no
authority.

### 3.2 Proposed normalized contracts

These contracts do not exist yet. They are proposals that extend canonical semantics:

| Proposed contract | Purpose | Likely canonical home |
| --- | --- | --- |
| `CapacityOffer` | An offered slice of capacity: provider, region, acquisition model, protocol, throughput class, quota, expiry, price, trust, entitlements, failure domain. | `@irp/gateway-registry` resource model |
| `AcquisitionAdapter` | External boundary that orders/allocates/activates/releases one offer for one acquisition model; owns provider credentials. | `@irp/gateway-registry` or `@irp/connectivity` adapter boundary (must be decided, not duplicated) |
| `Entitlement` | What a tenant/user may consume: plan, quota, scope, expiry, renewal rules. | gateway-registry/tenant boundary |
| `Allocation` | A reservation of capacity to an intent/session: TTL, renewal, release, fencing token. | runtime planning/reservation boundary |
| `UsageLedger` | Metered consumption per allocation: bytes in/out, window, expiry, rollover. | runtime telemetry/persistence boundary |
| `BandwidthPlan` | User-facing package mapping to entitlements + eligible offers. | API/product layer |

Invariants for every proposed contract:

- **No fabricated state.** Offers come from a provider response or an explicitly
  authorized local record; nothing is inferred from defaults.
- **Explicit trust and terms.** Every offer carries trust, entitlement scope and the terms
  reference that permitted its use.
- **Freshness and provenance.** Offers expire; stale offers are rejected rather than
  silently reused.
- **Revocability.** Community/partner offers can be revoked and quarantined.

---

## 4. Control flow

The capability follows the canonical control loop; it does not define a new one.

```
USER INTENT ("give me 25 Mbps for 30 days")
   |
   v
Intent plane -> compile -> governance (policy, entitlement, quota, autonomy)
   |
   v
Discovery -> CapacityOffer set (provider API / partner / community / shared infra)
   |
   v
Intelligence -> health, capacity, cost, trust, failure-domain diversity
   |
   v
Optimization -> ranked strategies (cost vs latency vs trust vs diversity)
   |
   v
Plan + Reserve (allocation, TTL, fencing token, epoch guard)
   |
   v
Transaction: prepare -> snapshot -> validate -> policy -> security -> safety
   |
   v
Acquire -> activate provider resource -> establish tunnel -> install route/DNS
   |
   v
Verify (real external destination through the provisioned path:
        reachability, expected egress/region, latency, measured throughput class)
   |                                  \
   | success -> commit -> meter usage  \ failure -> rollback -> verify rollback
   |                                       -> recover / select next eligible offer
   v                                       -> learn -> update knowledge
Learned state (usage, reliability, failure memory)
```

Failure semantics follow the canonical failure path: rollback, rollback verification,
recovery, quarantine of the failed strategy, selection of the next safe strategy,
re-verification.

### 4.1 Session lifecycle (proposed)

```
REQUESTED -> AUTHORIZED -> RESERVED -> ACQUIRING -> PROVISIONED
    -> VERIFIED -> ACTIVE -> (DEGRADED | DRAINING) -> RELEASED | EXPIRED | REVOKED
```

Every transition is an observable runtime event with correlation/decision/transaction
identifiers, so a user-visible "connection ready" state is always reconstructable to
evidence.

---

## 5. Data flow, state and persistence

| State class | Content | Degradation requirement |
| --- | --- | --- |
| Ephemeral runtime state | Active allocations, leases, fencing tokens, in-flight acquisitions. | Lost on restart; reconciled from durable state when available. |
| Persistent operational state | Entitlements, allocations, usage ledger, provider offer snapshots, session records. | Durable store required (#410/#411). Runtime continues locally with degraded entitlement knowledge. |
| Historical state | Acquisition outcomes, provider reliability, failure memory, quota burn history. | Advisory only; never required for the next decision. |
| Configuration | Plan catalog mapping, acquisition model enablement per tenant/region. | Must be schema-validated at startup; malformed configuration must not brick the daemon. |

Metering is an **outcome** of the data plane, not of control-plane bookkeeping: bytes are
counted from measured traffic, never estimated from a plan.

---

## 6. Failure modes and recovery

| Failure | Required behavior |
| --- | --- |
| Provider API unavailable | Fall back to another eligible offer/model; keep local autonomy; never fabricate an offer. |
| Offer expired / revoked mid-session | Drain session, verify rollback, re-acquire or release, notify. |
| Quota exhausted | Fail closed with explicit reason; do not silently exceed entitlement. |
| Acquisition succeeded but verification failed | Roll back acquisition (release provider resource), verify rollback, quarantine strategy, try next candidate. |
| Tunnel up but no real egress | Verification must fail; never report success on tunnel creation. |
| Metering store unavailable | Continue control locally; mark usage as unreconciled; never report a fabricated balance. |
| Community node misbehaving | Revoke trust, quarantine node, re-plan, report to operator. |
| Database/federation/AI outage | Local autonomy continues with deterministic fallback; optional intelligence degrades. |

---

## 7. Security and trust boundaries

- **Credential isolation.** Provider credentials live inside provider adapters
  (`WireGuardCredentialStore` / `OpenVPNCredentialStore` pattern). Secrets never enter
  logs, telemetry, AI context, plugin scope or remote-node messages.
- **Community node identity.** Enrollment requires identity attestation (existing
  `GatewaySecurityVerifier` Ed25519 identity/artifact model), explicit operator consent,
  trust scoring, revocation and quarantine. A self-asserted endpoint is never a gateway.
- **Tenant isolation.** Entitlements and allocations are tenant-scoped with cross-tenant
  access audit.
- **Terms compliance.** Each acquisition model carries the terms reference that permits
  its use; redistribution of third-party capacity beyond those terms is out of scope.
- **Fail closed.** Missing entitlement, missing trust, missing provider credentials or
  unverifiable outcome must deny or roll back, never proceed optimistically.
- **Least privilege.** Acquisition authority is scoped to the ordered resource and revoked
  on release.

---

## 8. Observability

Proposed event families (to be added to the versioned event stream, not a second bus):

```
capacity.offer.discovered
capacity.offer.rejected
entitlement.evaluated
allocation.reserved
allocation.released
acquisition.started | acquisition.succeeded | acquisition.failed
provisioning.verified | provisioning.verification_failed
usage.recorded
session.state_changed
```

Each event carries correlation id, decision id, transaction id, tenant, provider,
acquisition model, cost, capacity, freshness and provenance.

---

## 9. Current-state gap map (evidence based, `main`)

| Capability element | Current state | Evidence |
| --- | --- | --- |
| Capacity as selection evidence | **PARTIAL** — `GatewayCapacity` carries `utilizationPercent` / `availableCapacityPercent` / `checkedAt` only | `packages/gateway-registry/src/selection.ts` |
| Capacity state and allocation | **PARTIAL** — unit-less `GatewayCapacityState { limit, allocated, reserved }`; `InMemoryGatewayFleetManager` has no consumer outside its own tests | `packages/gateway-registry/src/fleet.ts` |
| Capacity feeding real selection | **MISSING** — the selection plane always passes an empty capacity map | `packages/resilience-runtime/src/gateway/gateway-registry-plane.ts` (`const capacity = new Map<string, GatewayCapacity>()`) |
| Metered usage / byte accounting | **MISSING** — only instantaneous throughput probes exist (`ThroughputProbe`, `TunnelHealth.throughputBps`) | `packages/network/src/index.ts`, `packages/tunnel/src/openvpn.ts` |
| Bandwidth shaping | **PARTIAL** — `allocateBandwidth` produces a `QosPlan` (allocation plan + rules), not a ledger | `packages/resilience-runtime/src/dataplane/qos.ts` |
| Reservation / epoch / TTL guards | **PARTIAL** — `ResourceReservationTable` + `DecisionEpoch` exist but are imported only by one test file and are not exported from the runtime barrel | `packages/resilience-runtime/src/planning/reservation.ts`, `packages/resilience-runtime/src/index.ts` |
| Entitlements / plans / quota | **MISSING** — only `TenantQuota { maxRecords }` (record count) exists; billing/tenant provisioning is an explicit non-goal of the tenant-isolation phase | `packages/resilience-runtime/src/fleet/tenant-isolation.ts`, `docs/phases/phase-119.md` |
| Cost / price model | **MISSING** — fabric `cost` is an empty dimensionless record; `GatewayMetadata` has no cost/capacity/SLA fields | `packages/resilience-runtime/src/fabric.ts`, `packages/gateway-registry/src/index.ts` |
| Provider acquisition adapter | **MISSING** — `ConnectivityProvider` only activates already-discovered local sources; no ordering/acquisition contract | `packages/connectivity/src/index.ts` |
| Provider lifecycle governance for capacity | **PARTIAL** — capability directory is read-only metadata; plugin governor covers plugins, not connectivity providers | `packages/resilience-runtime/src/control-api/capability-directory.ts` |
| Gateway identity/trust attestation | **PARTIAL** — `GatewaySecurityVerifier` implements Ed25519 identity + artifact attestation but has no runtime consumer | `packages/gateway-registry/src/security.ts` |
| Remote/community node trust | **MISSING** — federation probes are self-asserted name/region/public key with no cost, capacity or trust score | `packages/resilience-runtime/src/federation/probe-federation.ts` |
| One-click surface | **MISSING** — `gateway.inventory` and `tunnel.lifecycle` exist only as `pending-verification` manifest entries; no provisioning route/command | `apps/api/src/unified-product-api.ts` |
| Real egress capacity today | **MISSING** — Starlink integration is `monitor-only`; the Starlink resource catalog exposes no live endpoints (`publicEndpointProvided: false` everywhere) | `packages/connectivity/src/starlink.ts`, `packages/gateway-registry/src/starlink-resources.ts` |

---

## 10. Workstream decomposition

This workstream **does not create new numbered phases**. It composes existing roadmap
groups and requires formal authorization (issue + phase record) before implementation, in
line with `docs/roadmap/MASTER_ROADMAP_V2.md` and the repository's "no artificial phases"
rule.

| Gate | Primary roadmap group | Notes |
| --- | --- | --- |
| G1 Acquisition contract | Group C (Connectivity Fabric), Group J (Provider Lifecycle) | Extend existing resource/provider contracts. |
| G2 Discovery of offers | Group C, Group E (Telemetry) | Freshness, trust, cost, capacity, failure domains. |
| G3 Authorization / entitlement | Group B (Intent & Policy), Group F (Security & Trust) | Reuse intent governance; do not fork a policy engine. |
| G4 Metering | Group E (Telemetry), Group I (Data Plane) | Measured bytes per allocation. |
| G5 Provisioning transaction | Group D (Routing & Recovery), Phase 77 semantics | Canonical transaction + rollback. |
| G6 Outcome verification | Phase 97 (Service Reachability Intelligence), Group D | Real external destination verification. |
| G7 Replacement / recovery | Group D, Phase 99 (Predictive Failover) | Reuse failover/recovery authority. |
| G8 One-click surface | Group J (Platform APIs), product layer | Interface only; runtime stays authoritative. |
| G9 Real-environment evidence | #254, #323 | Requires real capacity + Linux host. |
| G10 Security review | Group F, Group K (Privacy/Compliance) | Terms, isolation, audit. |

---

## 11. Verification strategy

| Layer | Required coverage |
| --- | --- |
| Unit | Offer normalization, entitlement evaluation, quota math, allocation TTL/fencing, usage accounting, freshness rejection. |
| Integration | Intent → discovery → ranking → reservation → acquisition → tunnel → route → verification → commit; and the full failure path with rollback verification and next-candidate migration. |
| Failure/recovery | Provider outage, expired offer, quota exhaustion, verification failure, rollback failure, community-node revocation, database/telemetry outage. |
| Real environment | Linux host with `CAP_NET_ADMIN`, a real capacity source, a real tunnel and a real external destination verification (depends on #254/#323 and provider/partner access). |
| Architecture guards | No new control plane/provider registry/state registry; no privileged work in interface layers. |

**Evidence classification is mandatory** in every report:

1. implemented and tested;
2. implemented but external verification blocked;
3. verified in a real host environment with real capacity;
4. blocked by a genuine external dependency.

Simulated provider responses, mocked offers, fabricated quota balances or fixture
"provisioned" sessions must never be reported as provisioned capacity.

---

## 12. Non-goals

- Not a VPN reseller dashboard, marketplace storefront or third-party VPN bundle.
- Not a wrapper/launcher for third-party VPN applications.
- Not "bandwidth from nothing"; capacity requires an authorized source.
- Not a requirement that the user owns a VPS, server or dedicated hardware.
- Not hardcoded gateway/provider/country/protocol/endpoint selection, and not discovery of
  arbitrary public proxies.
- Not a second authority: no second control plane, scheduler, provider registry,
  transaction executor or decision engine.
- Not a claim of implemented capability before G1–G10 evidence exists.

---

## 13. Known limitations and external dependencies

| Dependency | Issue | Effect |
| --- | --- | --- |
| Linux host with `CAP_NET_ADMIN` for live tunnel/route execution and soak | #254, #323 | Blocks G9 real-environment evidence. |
| Durable PostgreSQL for entitlements, allocations and usage ledger | #410, #411 | Blocks durable entitlement/usage state; local autonomy must degrade safely meanwhile. |
| Auth lifecycle / device ownership enforcement | #412 | Blocks tenant-scoped one-click surface. |
| Actual provider/partner capacity access and agreements | — | Blocks G1 real adapters beyond the boundary contract. |
| Production certification | #323 | Blocks any release claim. |

---

## 14. Implementation references

- Canonical contract: [`IRP-SUPERPLATFORM-REFERENCE-ARCHITECTURE.md`](IRP-SUPERPLATFORM-REFERENCE-ARCHITECTURE.md)
- Gateway/tunnel architecture: [`gateway-and-tunnel-architecture.md`](gateway-and-tunnel-architecture.md)
- Control-plane ownership: [`control-plane-ownership.md`](control-plane-ownership.md)
- Security boundaries: [`security-boundaries.md`](security-boundaries.md)
- Runtime behavior: [`resilience-runtime.md`](resilience-runtime.md)
- Current roadmap: [`../roadmap/MASTER_ROADMAP_V2.md`](../roadmap/MASTER_ROADMAP_V2.md)
- Tracking issue: [#463](https://github.com/NahiraDev/InternetResiliencePlatform/issues/463)
