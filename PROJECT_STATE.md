# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Current State

- **Current phase:** Phase 52 — Automated Tunnel Lifecycle (**implementation complete; verification in progress**).
- **Phase 51:** implementation is complete and accepted after repository/CI verification on `main`.
- **Phase 47:** verified green by CI and accepted as complete.
- **Phase 48:** implementation is complete and accepted after verification.
- **Phase 49:** WireGuard provider implementation is complete and accepted after CI/runtime verification.
- **Phase 50:** OpenVPN provider implementation is complete and accepted after repository/runtime verification.
- **Next phase after Phase 52:** Phase 53 — Multi-Gateway Failover.
- **Roadmap:** 70 phases total and immutable as the current baseline. Additional execution/hardening phases may be proposed only after Phase 70 CTO/architecture review.
- **Core architecture:** headless Core + unified Control Plane + full-capability clients.
- **Client strategy:** Linux, macOS, Windows, iOS and Android are full product clients; mobile is not dashboard-only.
- **Gateway strategy:** `@irp/gateway-registry` owns gateway inventory/discovery/health and gateway selection. `@irp/tunnel` owns tunnel contracts, lifecycle and concrete providers. Do not duplicate these domains.
- **UI strategy:** Web Control Center begins at Phase 57 and never owns safety-critical routing logic.
- **README policy:** keep the root README concise; detailed architecture, procedures and phase history belong under `docs/`.

## Phase 52 — Automated Tunnel Lifecycle

**Implementation complete; repository/runtime verification in progress.** The canonical `@irp/tunnel` package now contains `AutomatedTunnelLifecycle` with bounded establish/connect/retry/reconnect/rotation/disconnect/destroy/shutdown behavior.

### Implementation evidence

- `packages/tunnel/src/lifecycle.ts`
- `packages/tunnel/src/lifecycle.test.ts`
- exported through `packages/tunnel/src/index.ts`
- phase record: `docs/phases/phase-52.md`

### Safety and lifecycle guarantees

- provider protocol/scope/routing/capability compatibility is checked before establishment;
- platform route context is validated before connection;
- full-tunnel/strict lifecycle requires a configured kill-switch implementation;
- kill switch remains enabled during establishment and is disabled only after post-connect health verification;
- health verification requires healthy status, connectivity, handshake and authentication evidence;
- connect attempts are bounded and timeout-protected;
- retry follows the canonical `failed → recovering → connecting` state path;
- concurrent operations on one tunnel are rejected;
- failed establishment is rolled back through provider/adapter cleanup and destruction;
- endpoint/credential-reference rotation is followed by verified reconnect;
- lifecycle events carry `phase: 52` metadata;
- no secret material is emitted by the lifecycle telemetry contract.

### Workflow audit and fixes

The Runtime Lab and Public Runtime Lab workflows were audited as part of Phase 52. The audit found three material gaps:

1. changes under `packages/tunnel/**` did not trigger the runtime verification workflows;
2. main-branch runtime evidence could be cancelled by a newer push because of `cancel-in-progress: true`;
3. readiness was not followed by a stability window that detects immediate process/container restarts.

Both workflows were corrected to include the tunnel package, preserve main-branch evidence, and assert post-readiness container stability/restart counts.

### Verification status

The Phase 52 implementation is **not yet marked complete**. Completion requires the final commit's repository CI, Runtime Lab and required Public Runtime Lab verification to pass. The currently running runtime workflows are the first verification of the audited workflow contract.

## Phase 51 — Automatic Gateway Selection

**Complete / verified.** Phase 51 adds a side-effect-free gateway selection primitive to the canonical gateway domain. Selection consumes existing inventory and health contracts plus optional capacity evidence and never creates tunnels or mutates routes/DNS.

### Verification evidence

- Verification commit: `ec6daceb56f98f9dff84bafe1d9cf20532c30a61`.
- CI run `33104741177` (`CI #770`) passed.
- CI job `98631462114` passed repository gates: integrity, documentation, lint, typecheck, test, fresh coverage, build, deterministic smoke test and production Docker runtime smoke test.
- CodeQL, Docker Publish and Datadog Synthetics for the verification commit passed.

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
