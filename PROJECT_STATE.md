# InternetResiliencePlatform — Canonical Project State

> Human-maintained handoff point for continuing development from any account, agent, or future session.

## Current State

- **Highest implemented area:** Phase 45 — Network Identity & Destination Policy Assurance (verification pending).
- **Active prerequisite verification:** Phase 44 — Data Analytics & Decision Intelligence.
- **Phase 43:** implementation is present; final CI/runtime completion evidence remains the gate.
- **Phase 44:** analytics engine, tests and specification have been added; final verification remains required.
- **Phase 45:** explicit egress/destination assurance has been added to `@irp/network-intelligence`, with hardened evidence validation, tests and phase contract; completion is blocked until repository/CI verification passes and the Phase 44 prerequisite gate is resolved.
- **Next planned phase:** Phase 46 — Authorized Gateway Inventory, only after Phase 45 completion gates pass.
- **Roadmap:** 70 phases total.
- **Product architecture:** Core-first, headless Core + unified Control Plane + full-capability clients.
- **Client strategy:** Linux, macOS, Windows, iOS and Android are product clients. Mobile is a Full Client, not a read-only dashboard.
- **UI strategy:** Web Control Center is an explicit product track beginning in Phase 57; it does not contain safety-critical routing logic.
- **Gateway strategy:** managed gateway/tunnel capabilities are a first-class product track in Phases 46–55, provider-neutral and policy-controlled.
- **README policy:** keep the root README concise; detailed architecture, procedures and phase history belong under `docs/`.

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
- Tests for valid signatures, tampering, replay, revocation and cross-region comparison.

The federation layer is evidence-only. It does not itself decide or apply routes.

## Phase 44 — Data Analytics & Decision Intelligence

The active analytics work provides deterministic, bounded analytics over historical/federated evidence:

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

## Product Objective

The core platform must autonomously:

```text
Observe → Measure → Detect → Diagnose → Decide → Policy/Safety Check
→ Apply → Verify → Monitor → Failover/Recover → Learn → Explain
```
