# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Current State

- **Current phase:** Phase 62 — macOS Full Client (**implementation started; verification required**).
- **Phase 62:** implementation is on `main`; final macOS runtime and CI verification evidence is still required before closure.
- **Phase 61:** implementation remains subject to full repository/runtime verification under the phase verification rules.
- **Phase 60:** implementation was merged to `main` by PR #170; its final verification status remains governed by the phase verification rules.
- **Phase 59:** implementation is merged to `main`; final closure remains governed by repository/runtime evidence.
- **Phase 58:** implementation is merged to `main`; final verification evidence remains required.
- **Phase 54:** implementation is in `@irp/gateway-registry`; final repository/CI verification remains required.
- **Phase 53:** implementation is complete, but its final verification gate remains explicitly tracked until the verified fix is accepted on `main`.
- **Phase 52:** implementation is complete, but final repository/runtime verification is still required.
- **Phase 51:** implementation is complete and accepted after repository/CI verification on `main`.
- **Phase 50:** OpenVPN provider implementation is complete and accepted after repository/runtime verification.
- **Phase 49:** WireGuard provider implementation is complete and accepted after CI/runtime verification.
- **Phase 48:** secure tunnel abstraction is complete and accepted after verification.
- **Phase 47:** gateway discovery and health is verified green and accepted.
- **Roadmap:** 70 phases total and immutable as the current baseline. Additional execution/hardening phases may be proposed only after Phase 70 CTO/architecture review.
- **Core architecture:** headless Core + unified Control Plane + full-capability clients.
- **Client strategy:** Linux, macOS, Windows, iOS and Android are full product clients; mobile is not dashboard-only.
- **Gateway strategy:** `@irp/gateway-registry` owns gateway inventory/discovery/health, deterministic gateway selection, multi-gateway failover coordination and fleet operations. `@irp/tunnel` owns tunnel contracts, lifecycle and concrete providers. Do not duplicate these domains.
- **UI strategy:** Web Control Center begins at Phase 57 and never owns safety-critical routing logic. Desktop clients consume shared capability contracts and do not duplicate routing/policy intelligence.
- **Notification strategy:** Phase 59 owns operational incident/notification state and alert presentation contracts. It must not gain authority over routing, DNS, tunnel or gateway mutations.
- **Administration strategy:** Phase 60 owns operator configuration, self-hosting, migrations, backups, restore safety and maintenance tooling. It must not gain routing, DNS, tunnel or gateway execution authority.
- **Linux client strategy:** Phase 61 owns Linux process/platform integration, local diagnostics presentation and client-local controls. Safety-critical routing, DNS, tunnel, gateway and failover decisions remain in shared Core/Control Plane.
- **macOS client strategy:** Phase 62 owns macOS process/platform integration, local diagnostics presentation and client-local controls. Safety-critical routing, DNS, tunnel, gateway and failover decisions remain in shared Core/Control Plane.
- **Trusted-source CI workflow:** keep the existing trusted source artifact workflow semantics unchanged.
- **README policy:** keep the root README concise; detailed architecture, procedures and phase history belong under `docs/`.

## Phase 62 — macOS Full Client

**Implementation started; verification required.**

### Implementation evidence

- `packages/macos-client/package.json`
- `packages/macos-client/tsconfig.json`
- `packages/macos-client/src/index.ts`
- `packages/macos-client/tests/index.test.ts`
- `packages/macos-client/launchd/com.nahiradev.irp.macos-client.plist`
- `docs/phases/phase-62.md`
- `.github/workflows/macos-client.yml`

### Current guarantees

- macOS diagnostics use bounded `execFile` calls rather than shell interpolation.
- Interface, route and resolver state are presented as observations; the client does not mutate network state.
- Autonomous mode is explicit, deterministic and locally controlled; it does not bypass the shared safety/policy boundary.
- The local control surface binds to loopback only by default.
- Non-macOS environments report a deterministic unsupported state rather than pretending macOS runtime evidence exists.
- launchd lifecycle contract declares background execution, launch-at-login and restart behavior without granting network-policy authority.

### Remaining verification

- frozen-lockfile install after importer synchronization;
- repository typecheck, lint, tests and build;
- real macOS host diagnostics using `ifconfig`, `route` and `scutil`;
- launchd install/start/restart/stop verification;
- desktop UI/tray integration verification on supported macOS environments;
- security review of local control and process/lifecycle boundaries;
- green CI.

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
