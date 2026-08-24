# InternetResiliencePlatform — Canonical Project State

> Human-maintained handoff point for continuing development from any account, agent, or future session.

## Current State

- **Highest implemented area:** Phase 48 — Secure Tunnel Abstraction (verification pending).
- **Phase 47:** verified green by CI and accepted as complete.
- **Phase 48:** provider-neutral tunnel lifecycle contracts, capability negotiation, bounded connect/disconnect/reconnect/health operations, defensive session state, opaque provider context and failure/degradation semantics are implemented; final CI verification remains the completion gate.
- **Phase 45:** explicit egress/destination assurance is present in `@irp/network-intelligence`; its verification is governed by the repository's phase gates.
- **Phase 46:** gateway inventory, ownership, capabilities, trust state, bounded lifecycle transitions and safe retirement/removal are implemented in `@irp/gateway-registry`.
- **Roadmap:** 70 phases total and immutable as the current baseline. Additional execution/hardening phases may be proposed only after Phase 70 CTO/architecture review.
- **Product architecture:** Core-first, headless Core + unified Control Plane + full-capability clients.
- **Client strategy:** Linux, macOS, Windows, iOS and Android are product clients. Mobile is a Full Client, not a read-only dashboard.
- **UI strategy:** Web Control Center is an explicit product track beginning in Phase 57; it does not contain safety-critical routing logic.
- **Gateway strategy:** managed gateway/tunnel capabilities are a first-class product track in Phases 46–55, provider-neutral and policy-controlled.
- **README policy:** keep the root README concise; detailed architecture, procedures and phase history belong under `docs/`.

## Phase 48 — Secure Tunnel Abstraction

Phase 48 establishes the provider-neutral contract that later tunnel providers implement without coupling the Core to a specific vendor or protocol.

Implemented in `@irp/gateway-registry`:

- `TunnelProvider` contract with capability declaration and lifecycle operations;
- `TunnelTarget` with gateway, endpoint, protocol, transport and address-family requirements;
- explicit lifecycle states: `disconnected`, `connecting`, `connected`, `degraded`, `disconnecting`, `failed`;
- deterministic lifecycle transition validation;
- capability negotiation before provider execution;
- connect, disconnect and reconnect operations;
- provider health-check contract and explicit degraded semantics;
- hard per-operation timeouts;
- bounded and validated health evidence;
- opaque provider-owned connection handles;
- opaque provider context that is not persisted in public session state;
- defensive copies of returned session state;
- explicit failure reasons;
- no route, DNS, gateway lifecycle, failover or policy mutation;
- no provider-specific command execution;
- no private-key generation, storage or logging.

Tests cover normal lifecycle, unsupported capabilities, connect timeout, disconnect, reconnect capability enforcement, healthy/degraded health, health timeout, opaque context handling and defensive copies.

Phase 48 intentionally does not implement WireGuard/OpenVPN adapters, key rotation, provisioning, gateway selection or automatic failover; those are later roadmap phases.

## Phase 47 — Gateway Discovery & Health

The Phase 47 layer extends the authoritative Phase 46 gateway inventory without creating a parallel gateway model:

- provider-neutral `GatewayDiscoverySource` contract;
- bounded discovery reconciliation into the existing registry;
- registration of newly discovered gateways;
- metadata reconciliation for existing gateways;
- retired-gateway resurrection protection;
- stale inventory reporting without implicit lifecycle mutation;
- explicit health states: `healthy`, `degraded`, `unreachable`, `stale`, `unknown`;
- deterministic quality scoring from latency and packet loss;
- explicit unknown semantics when reachability exists without quality measurements;
- bounded timestamp and measurement validation;
- hard per-probe timeout boundary;
- no route, DNS, tunnel or failover mutation.

Health is decision-support evidence. Gateway selection and execution remain later phases.

## Phase 46 — Gateway Registry

The gateway registry establishes the authoritative inventory contract for later gateway discovery, health, selection and tunnel phases:

- stable gateway identity and names;
- endpoint metadata with address-family declaration;
- ownership and management source;
- optional provider reference without provider-specific execution;
- declared tunnel protocols, transports and capabilities;
- explicit lifecycle state machine: `registered`, `active`, `draining`, `disabled`, `retired`;
- explicit trust state: `untrusted`, `pending`, `trusted`, `revoked`;
- bounded inventory filtering by lifecycle, trust, region, country, provider, owner and tags;
- defensive copies on registry reads/writes;
- safe retirement and deletion only after retirement;
- revoked trust cannot be silently restored;
- no route, DNS, tunnel or failover mutation.

## Phase 43 — Distributed Probe Federation

Implemented federation capabilities include:

- Ed25519 probe identity and public-key registration.
- Canonical signed evidence envelopes.
- Replay protection using evidence IDs and payload fingerprints.
- Clock-skew and evidence-age validation.
- Per-probe and global bounded evidence capacity.
- Probe registration, inspection and revocation API.
- Signed evidence ingestion API.
- Destination-level regional comparison.
- Bounded network measurements and federation statistics.

The federation layer is evidence-only. It does not itself decide or apply routes.

## Phase 44 — Data Analytics & Decision Intelligence

The analytics layer provides deterministic, bounded analytics over historical/federated evidence:

- availability, latency and packet-loss summaries;
- p50/p95/p99 latency;
- trends and confidence;
- bounded anomaly detection with reason/severity;
- explicit insufficient-data semantics;
- input/range/sample limits;
- tests for normal, sparse, invalid and anomalous data.

Analytics is decision support. It does not directly bypass policy/safety gates or mutate routes.

## Phase 45 — Network Identity & Destination Policy Assurance

Implementation is an additive module in `@irp/network-intelligence`:

- explicit egress identity evidence with source provenance and observation time;
- explicit destination identity evidence with hostname, resolved addresses, protocol and source provenance;
- policy constraints for egress IP/ASN/organization and destination hostname/address;
- required independent egress-source enforcement;
- bounded freshness validation, including future-dated evidence;
- strict IPv4/IPv6 and address-family validation;
- required resolved destination addresses and valid destination ports;
- explicit `compliant`, `non-compliant` and `insufficient-data` outcomes;
- deterministic findings and tests for normalization, policy mismatch, stale/future evidence, insufficient confidence and invalid input.

The assurance layer is read-only decision support. It does not mutate routes, DNS, tunnels or failover state, and it does not infer service capability from geographic IP information.

## Mobile Product Contract

The previous remote-only mobile model is superseded by the 70-phase product roadmap.

The future iOS/Android clients must be **Full Clients** and consume the same capability contracts as Desktop/Web wherever the operating system permits. Native networking functionality is isolated behind iOS/Android adapters.

Required mobile capabilities include, subject to platform permissions:

- enrollment/authentication and secure credential storage;
- runtime and network status;
- analytics and historical views;
- policies and service profiles;
- gateway/tunnel state;
- autopilot state and controlled commands;
- diagnostics;
- notifications;
- device/session management;
- synchronized configuration.

The mobile UI must never reimplement Core routing or policy logic.

## Gateway/Tunnel Contract

Gateway/tunnel support is provider-neutral. A gateway is eligible only after authentication, capability checks, health verification and policy evaluation. Egress identity and service reachability are measured independently; an IP location alone is not proof of a service capability.

## Verification Rules

A phase is not complete because source files exist. Completion requires acceptance criteria plus repository verification and, where relevant, runtime/online evidence.

For networking/runtime phases, completion requires the applicable repository validation, typecheck, lint, tests, build, API smoke, Docker/runtime, platform integration and/or external validation gates.

For Phase 48 specifically, verification must include the new tunnel contract and tests through the normal workspace test/typecheck/build graph and must not rely on test-only exceptions or unrelated CI bypasses.

## Continuation Rules

1. Read `ROADMAP.md` and this file before starting work.
2. Determine the highest phase whose acceptance criteria are genuinely complete.
3. Never assume completion from source presence alone.
4. Resume from the current failing verification gate before starting a dependent phase.
5. Inspect existing implementation before creating duplicate modules or abstractions.
6. Preserve compatible contracts unless a phase explicitly requires a breaking change.
7. Prefer production-grade fixes over test-only workarounds.
8. Keep Core authoritative; clients are adapters.
9. Keep security, destination-awareness, application-level verification, failover safety, auditability and rollback first-class.
10. Never infer regional egress from the destination being tested; prove it from independently observed probe egress.
11. Every autonomous network mutation must pass policy/safety checks and be verifiable and reversible.
12. Health and discovery are evidence-producing layers; they do not themselves activate gateways or mutate routes.

## Product Objective

The core platform must autonomously:

```text
Observe → Measure → Detect → Diagnose → Decide → Policy/Safety Check
→ Apply → Verify → Monitor → Failover/Recover → Learn → Explain
```
