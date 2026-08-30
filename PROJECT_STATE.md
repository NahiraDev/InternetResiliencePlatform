# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Current State

- **Current phase:** Phase 59 — Notifications & Incident Center (**implementation started; verification required**).
- **Phase 59:** implementation is isolated on `phase/59-notifications-incident-center`; it is not merged to `main` and remains subject to full repository/database/runtime verification.
- **Phase 58:** implementation is merged to `main`; final verification evidence for the latest follow-up fixes must remain green before the phase is treated as fully closed.
- **Phase 54:** implementation is in `@irp/gateway-registry`; final repository/CI verification remains required.
- **Phase 53:** implementation is complete, but its final verification gate remains explicitly tracked until the verified Phase 53 fix is accepted on `main`.
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
- **Notification strategy:** Phase 59 owns operational incident/notification state and alert presentation contracts. It must not gain authority over routing, DNS, tunnel or gateway mutations.
- **README policy:** keep the root README concise; detailed architecture, procedures and phase history belong under `docs/`.

## Phase 59 — Notifications & Incident Center

**Implementation started; verification required.** The phase introduces a server-authoritative incident lifecycle and persisted in-product notification center on top of evidence produced by the runtime and Phase 58 real measurements.

### Implementation evidence

- `apps/api/src/notifications.ts`
- `apps/api/src/notifications.test.ts`
- `apps/api/src/notifications-api.ts`
- `apps/api/src/remote-entrypoint.ts`
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260830230000_phase_59_notifications/migration.sql`
- `docs/phases/phase-59.md`

### Current guarantees

- deterministic incident fingerprinting collapses repeated matching observations into one logical incident;
- incident lifecycle is `open` → `acknowledged` → `resolved`;
- a later matching observation reopens the same logical incident identity instead of creating a duplicate;
- incident evidence, affected components, correlation reason and confidence are retained;
- security and policy failures map to critical severity;
- PostgreSQL persistence and a deterministic in-memory test adapter share the same domain contract;
- notification read/unread state is supported;
- authenticated/RBAC-protected API routes expose incident and notification inspection and operator actions;
- the notification layer has no route, DNS, tunnel or gateway execution authority.

### Verification status

Phase 59 is **not marked complete**. Completion requires `pnpm validate`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, migration validation and required CI/runtime evidence on the final Phase 59 commit.

## Phase 58 — Real Network Measurements

Implementation is merged to `main`. It hardens `@irp/network-intelligence` so network evidence is based on actual bounded measurements rather than synthetic or mislabeled values.

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
