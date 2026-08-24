# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Current State

- **Highest implemented phase:** Phase 48 — Secure Tunnel Abstraction.
- **Phase 47:** verified green by CI and accepted as complete.
- **Phase 48:** implementation is complete pending CI verification.
- **Next phase after green verification:** Phase 49 — WireGuard Provider.
- **Roadmap:** 70 phases total and immutable as the current baseline. Additional execution/hardening phases may be proposed only after Phase 70 CTO/architecture review.
- **Core architecture:** headless Core + unified Control Plane + full-capability clients.
- **Client strategy:** Linux, macOS, Windows, iOS and Android are full product clients; mobile is not dashboard-only.
- **Gateway strategy:** `@irp/gateway-registry` owns gateway inventory/discovery/health. `@irp/tunnel` owns tunnel contracts and lifecycle. Do not duplicate these domains.
- **UI strategy:** Web Control Center begins at Phase 57 and never owns safety-critical routing logic.
- **README policy:** keep the root README concise; detailed architecture, procedures and phase history belong under `docs/`.

## Phase 48 — Secure Tunnel Abstraction

The authoritative tunnel implementation is `@irp/tunnel`. Existing provider-neutral lifecycle/state/provider contracts were retained and hardened rather than creating a parallel abstraction.

Phase 48 additions:

- provider compatibility validation before provider execution;
- protocol, endpoint, scope, routing-mode and required-capability checks;
- bounded tunnel operation helper with 1–300 second production bounds;
- cooperative `AbortSignal` propagation for providers that support cancellation;
- health evidence validation for timestamp freshness, latency, packet loss and internal consistency;
- explicit lifecycle transition authority through the existing `transitionTunnel` state machine;
- credential-reference-only security boundary;
- no private-key storage/generation/logging;
- no provider-specific command execution;
- no route/DNS/failover mutation;
- no new external dependencies.

Tests cover provider compatibility, capability mismatch, endpoint mismatch, bounded operation behavior, invalid timeout bounds, health evidence validation and lifecycle transitions. Existing tunnel tests remain authoritative for provider registry, lifecycle, selection, redaction, recovery and simulation behavior.

Phase 48 deliberately does not implement WireGuard or another concrete provider. Those belong to later phases, beginning with Phase 49.

## Phase 47 — Gateway Discovery & Health

Implemented and verified:

- provider-neutral gateway discovery reconciliation;
- registration and metadata reconciliation;
- retired-gateway resurrection protection;
- stale inventory reporting;
- health states: `healthy`, `degraded`, `unreachable`, `stale`, `unknown`;
- deterministic quality scoring from latency and packet loss;
- bounded measurement/timestamp validation;
- hard per-probe timeout;
- no route, DNS, tunnel or failover mutation.

## Phase 46 — Gateway Registry

Implemented and verified gateway inventory primitives:

- stable identity and endpoint metadata;
- ownership/provider metadata;
- capabilities and address-family declaration;
- lifecycle: `registered`, `active`, `draining`, `disabled`, `retired`;
- trust: `untrusted`, `pending`, `trusted`, `revoked`;
- bounded filtering;
- defensive copies;
- safe retirement/removal;
- revoked trust cannot be silently restored.

## Earlier Security/Intelligence Contracts

- Phase 43: signed distributed probe federation with replay protection, revocation, bounded ingestion and regional comparison.
- Phase 44: deterministic historical/federated analytics, percentiles, trends, confidence, anomaly detection and insufficient-data semantics.
- Phase 45: explicit egress identity, destination identity and policy assurance with independent egress evidence and bounded freshness validation.

## Mobile Product Contract

Future iOS/Android clients are **Full Clients** and consume the same Core capability contracts wherever platform permissions allow. Native networking is isolated behind platform adapters; routing and policy logic are never duplicated in UI code.

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
