# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Current State

- **Current phase:** Phase 52 — Automated Tunnel Lifecycle (not started).
- **Phase 51:** implementation is complete and accepted after repository/CI verification on `main`.
- **Phase 47:** verified green by CI and accepted as complete.
- **Phase 48:** implementation is complete and accepted after verification.
- **Phase 49:** WireGuard provider implementation is complete and accepted after CI/runtime verification.
- **Phase 50:** OpenVPN provider implementation is complete and accepted after repository/runtime verification.
- **Next phase:** Phase 52 — Automated Tunnel Lifecycle.
- **Roadmap:** 70 phases total and immutable as the current baseline. Additional execution/hardening phases may be proposed only after Phase 70 CTO/architecture review.
- **Core architecture:** headless Core + unified Control Plane + full-capability clients.
- **Client strategy:** Linux, macOS, Windows, iOS and Android are full product clients; mobile is not dashboard-only.
- **Gateway strategy:** `@irp/gateway-registry` owns gateway inventory/discovery/health and gateway selection. `@irp/tunnel` owns tunnel contracts, lifecycle and concrete providers. Do not duplicate these domains.
- **UI strategy:** Web Control Center begins at Phase 57 and never owns safety-critical routing logic.
- **README policy:** keep the root README concise; detailed architecture, procedures and phase history belong under `docs/`.

## Phase 51 — Automatic Gateway Selection

**Complete / verified.** Phase 51 adds a side-effect-free gateway selection primitive to the canonical gateway domain. Selection consumes existing inventory and health contracts plus optional capacity evidence and never creates tunnels or mutates routes/DNS.

### Verification evidence

- Verification commit: `ec6daceb56f98f9dff84bafe1d9cf20532c30a61`.
- CI run `33104741177` (`CI #770`) passed.
- CI job `98631462114` passed all repository gates: repository integrity, documentation integrity, lint, typecheck, test, fresh coverage, build, deterministic smoke test and production Docker runtime smoke test.
- CodeQL, Docker Publish and Datadog Synthetics for the verification commit passed.
- The cancelled Public Runtime Lab run was associated with an earlier runtime-lab change and is not a Phase 51 acceptance dependency because gateway selection is explicitly side-effect free.

### Additions

- policy-aware gateway eligibility;
- active lifecycle and trusted-gateway enforcement;
- health freshness, reachability, status and score validation;
- latency and packet-loss limits;
- optional capacity utilization limits;
- region/provider/tag/tunnel-protocol/address-family constraints;
- bounded deterministic scoring from health, quality, capacity and preferences;
- configurable hysteresis to prevent unnecessary gateway switching;
- deterministic gateway-ID tie breaking;
- explicit rejection reasons and score components;
- human-readable decision explanations;
- input immutability and no network/tunnel/route/DNS side effects;
- unit coverage for normal, boundary, invalid and failure-path selection behavior.

Phase 51 remains out of automated tunnel lifecycle, multi-gateway failover, fleet operations and gateway supply-chain hardening.

## Phase 50 — Additional Tunnel Providers

Phase 50 extends the canonical `@irp/tunnel` abstraction with an OpenVPN provider without creating a second tunnel lifecycle or decision model.

## Phase 49 — WireGuard Provider

The first concrete tunnel provider is implemented inside the canonical `@irp/tunnel` package so it consumes the Phase 48 contract directly without introducing another tunnel abstraction or workspace dependency.

## Phase 48 — Secure Tunnel Abstraction

The authoritative tunnel implementation is `@irp/tunnel`. Existing provider-neutral lifecycle/state/provider contracts were retained and hardened rather than creating a parallel abstraction.

## Phase 47 — Gateway Discovery & Health

Implemented and verified provider-neutral gateway discovery, health classification, quality scoring, freshness validation and bounded probing without route/DNS/tunnel/failover mutation.

## Phase 46 — Gateway Registry

Implemented and verified gateway inventory primitives including stable identity, endpoint metadata, ownership/provider metadata, capabilities, lifecycle, trust, bounded filtering, defensive copies and safe retirement/removal.

## Earlier Security/Intelligence Contracts

- Phase 43: signed distributed probe federation with replay protection, revocation, bounded ingestion and regional comparison.
- Phase 44: deterministic historical/federated analytics, percentiles, trends, confidence, anomaly detection and insufficient-data semantics.
- Phase 45: explicit egress identity, destination identity and policy assurance with independent egress evidence and bounded freshness validation.

## Verification Rules

A phase is not complete because source files exist. Completion requires acceptance criteria plus repository verification and, where relevant, runtime/online evidence.

For every phase:

1. inspect existing implementation before adding abstractions;
2. preserve compatible contracts unless a breaking change is explicitly required;
3. add normal, boundary, invalid and failure-path tests;
4. run repository validation, typecheck, lint, relevant tests and build;
5. apply security/abuse review to security-sensitive changes;
6. verify runtime behavior for networking/process/container changes;
7. update documentation and project state;
8. require green CI before marking the phase complete.

For networking automation, every mutation must be policy-checked, bounded, observable, reversible and auditable.

## Product Objective

```text
Observe → Measure → Detect → Diagnose → Decide → Policy/Safety Check
→ Apply → Verify → Monitor → Failover/Recover → Learn → Explain
```
