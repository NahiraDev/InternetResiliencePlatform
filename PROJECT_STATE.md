# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Current State

- **Current phase:** Phase 58 — Real Network Measurements (**implementation started; verification required**).
- **Phase 58:** implementation is isolated on `phase/58-real-network-measurements`; it has not been merged to `main` and remains subject to full repository/runtime verification.
- **Phase 54:** implementation is in `@irp/gateway-registry`; final repository/CI verification is required before it can be accepted as complete.
- **Phase 53:** implementation is complete in the repository, but its final verification gate remains explicitly tracked until the verified Phase 53 fix is accepted on `main`.
- **Phase 52:** implementation is complete, but final repository/runtime verification is still required before it can be accepted as complete.
- **Phase 51:** implementation is complete and accepted after repository/CI verification on `main`.
- **Phase 50:** OpenVPN provider implementation is complete and accepted after repository/runtime verification.
- **Phase 49:** WireGuard provider implementation is complete and accepted after CI/runtime verification.
- **Phase 48:** secure tunnel abstraction is complete and accepted after verification.
- **Phase 47:** gateway discovery and health is verified green and accepted.
- **Roadmap:** 70 phases total and immutable as the current baseline. Additional execution/hardening phases may be proposed only after Phase 70 CTO/architecture review.
- **Core architecture:** headless Core + unified Control Plane + full-capability clients.
- **Client strategy:** Linux, macOS, Windows, iOS and Android are full product clients; mobile is not dashboard-only.
- **Gateway strategy:** `@irp/gateway-registry` owns gateway inventory/discovery/health, deterministic gateway selection, multi-gateway failover coordination and fleet operations. `@irp/tunnel` owns tunnel contracts, lifecycle and concrete providers. Do not duplicate these domains.
- **UI strategy:** Web Control Center begins at Phase 57 and never owns safety-critical routing logic.
- **README policy:** keep the root README concise; detailed architecture, procedures and phase history belong under `docs/`.

## Phase 58 — Real Network Measurements

**Implementation started; verification required.** Phase 58 hardens `@irp/network-intelligence` so network evidence is based on actual bounded measurements rather than synthetic or mislabeled values.

### Implementation evidence

- `packages/network-intelligence/src/providers/PingProvider.ts`
- `packages/network-intelligence/src/providers/HTTPProvider.ts`
- `packages/network-intelligence/src/metrics/PacketLossMetric.ts`
- `packages/network-intelligence/src/metrics/BandwidthMetric.ts`
- `packages/network-intelligence/src/metrics/GatewayMetric.ts`
- `packages/network-intelligence/src/metrics/CaptivePortalMetric.ts`
- `docs/phases/phase-58.md`

### Measurement guarantees

- production ping uses the platform ICMP utility without shell interpolation;
- packet loss is derived from actual ping success/failure observations;
- TLS timing measures the actual TLS handshake rather than total HTTP request duration;
- bandwidth is based on actual bytes transferred and elapsed time;
- captive-portal detection exposes redirect evidence as a signal rather than proof of filtering;
- measurement providers remain cancellable and bounded;
- existing mockable providers remain available for deterministic tests;
- measurement code does not mutate routes, DNS, tunnels or gateway state;
- Internet Intelligence remains advisory and does not gain execution authority.

### Verification status

Phase 58 is **not marked complete**. Completion requires repository validation, typecheck, lint, relevant tests/builds and CI/runtime verification for the final Phase 58 commit.

## Phase 57 — Control Loop Integrity & Real Postconditions

Phase 57 requires real adapter-observed postconditions, fail-closed unsupported live actions, and canonical reconciliation. Measurement follow-up work continues in Phase 58.

## Phase 54 — Gateway Fleet Operations

Implementation is in `@irp/gateway-registry`; verification remains required.

## Phase 53 — Multi-Gateway Failover

Implementation is in `@irp/gateway-registry`; verification remains required.

## Phase 52 — Automated Tunnel Lifecycle

Implementation is in `@irp/tunnel`; repository/runtime verification remains required.

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
