# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Current State

- **Current phase:** Phase 70 — IRP v1.0 Production Certification (**implementation started; certification evidence required**).
- **Phase 70:** versioned certification manifest, fail-closed evidence contract, certification verifier, evidence secret-scan and Phase 70 CI gates are implemented on the Phase 70 branch. Production certification is not claimed until runtime, device, regional, security, recovery and release evidence is independently verified.
- **Phase 69:** production-hardening contract, compatibility matrix, release checklist, machine-readable readiness manifest, bounded chaos/soak and backup/restore readiness harness, and Phase 69 CI gates are implemented on `main`; full repository/runtime/security/device evidence remains required before closure.
- **Phase 68:** Android `VpnService` execution boundary is implemented under `clients/android`; validated tunnel configuration, explicit packet-forwarding transport boundary, fail-closed startup, lifecycle cleanup, VPN service registration and configuration tests are present. Final evidence remains governed by the phase verification rules.
- **Phase 67:** Android full-client boundary is implemented under `clients/android`; enrollment/session, Keystore-backed credentials, persisted device identity, read-only diagnostics, analytics/policy contracts, Compose presentation, tests and Android CI scaffolding are present.
- **Phase 66:** native iOS Network Extension boundary is implemented under `clients/ios`; packet-tunnel configuration validation, `NETunnelProviderManager` lifecycle, `NEPacketTunnelProvider` extension metadata/entitlements, and Xcode project scaffolding are present.
- **Phase 65:** native iOS full-client boundary is implemented under `clients/ios`; enrollment/session, Keychain-backed credentials, diagnostics/analytics presentation and policy requests are covered.
- **Phase 64:** shared platform-neutral mobile client core is implemented in `@irp/core`; repository/runtime verification remains required before closure.
- **Phase 63:** Windows Full Client implementation is on `main`; native Windows runtime and CI verification remain required before closure.
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
- **UI strategy:** Web Control Center begins at Phase 57 and never owns safety-critical routing logic. Desktop and mobile clients consume shared capability contracts and do not duplicate routing/policy intelligence.
- **Notification strategy:** Phase 59 owns operational incident/notification state and alert presentation contracts. It must not gain authority over routing, DNS, tunnel or gateway mutations.
- **Administration strategy:** Phase 60 owns operator configuration, self-hosting, migrations, backups, restore safety and maintenance tooling. It must not gain routing, DNS, tunnel or gateway execution authority.
- **Linux client strategy:** Phase 61 owns Linux process/platform integration, local diagnostics presentation and client-local controls. Safety-critical routing, DNS, tunnel, gateway and failover decisions remain in shared Core/Control Plane.
- **macOS client strategy:** Phase 62 owns macOS process/platform integration, local diagnostics presentation and client-local controls. Safety-critical routing, DNS, tunnel, gateway and failover decisions remain in shared Core/Control Plane.
- **Windows client strategy:** Phase 63 owns Windows process/platform integration, local diagnostics presentation and client-local controls. Safety-critical routing, DNS, tunnel, gateway and failover decisions remain in shared Core/Control Plane.
- **Mobile client strategy:** Phase 64 provides platform-neutral shared state, diagnostics and local policy contracts in `@irp/core`. Native OS networking and privileged integrations remain behind platform adapters in Phases 65–68.
- **iOS client strategy:** Phase 65 owns native iOS presentation, enrollment/session lifecycle, secure credential storage, diagnostics/analytics presentation and explicit Control Plane policy requests. Network Extension and privileged system networking remain exclusively in Phase 66.
- **iOS network integration strategy:** Phase 66 owns the Network Extension execution boundary and VPN profile lifecycle. It may apply only Control Plane-authorized tunnel configuration. It must not implement gateway selection, destination policy, failover decisions or a second tunnel protocol stack.
- **Android client strategy:** Phase 67 owns Android-native presentation, enrollment/session lifecycle, secure credential storage, diagnostics/analytics presentation and explicit Control Plane policy requests. VPN/network execution remains exclusively in Phase 68.
- **Android network integration strategy:** Phase 68 owns Android VPN/network execution and must consume Control Plane-authorized tunnel contracts. It must not duplicate gateway selection, destination policy, failover decisions or a second tunnel protocol stack.
- **Production hardening strategy:** Phase 69 owns cross-platform release readiness, compatibility evidence, accessibility/localization acceptance, upgrade/rollback safety, security audit controls, bounded chaos/soak verification, backup/restore verification and release engineering. It does not move product authority into clients.
- **v1.0 certification strategy:** Phase 70 owns the final evidence contract and release gate. It aggregates verified repository, runtime, security, recovery, regional, platform, device and release-engineering evidence without treating source presence or a contract check as certification.
- **Trusted-source CI workflow:** keep the existing trusted source artifact workflow semantics unchanged.
- **README policy:** keep the root README concise; detailed architecture, procedures and phase history belong under `docs/`.

## Phase 70 — IRP v1.0 Production Certification

**Implementation in progress; certification evidence required.**

### Implementation evidence

- `docs/phases/phase-70.md`
- `ops/release/phase-70-certification.json`
- `scripts/phase70-certification.mjs`
- `.github/workflows/phase-70-certification.yml`

### Current guarantees

- v1.0 certification requirements are explicit and machine-readable.
- Supported product surfaces are represented across Core, API, gateways, web, Linux, macOS, Windows, iOS and Android.
- Missing runtime/device/regional/release evidence is fail-closed and cannot be represented as certification.
- Certification evidence receives an explicit secret-material safety scan.
- Phase 69 repository/readiness gates are treated as prerequisites rather than silently assumed.
- Phase 70 CI has explicit dependencies, bounded job timeouts and PR-only cancellation semantics; main evidence is not cancelled by newer main pushes.
- Required checks do not intentionally use false-green mechanisms such as `continue-on-error` or shell success overrides.

### Remaining certification evidence

- Full repository `validate`, typecheck, lint, tests and build.
- Security analysis/dependency review and artifact integrity evidence.
- Control-plane and gateway runtime evidence.
- Regional public-IP/service evidence.
- Real upgrade/rollback rehearsal against a representative deployment.
- Real backup/restore rehearsal against representative control-plane state.
- Runtime chaos/soak evidence in an isolated provisioned environment.
- Accessibility/localization verification on each applicable user-facing client.
- Linux, macOS, Windows, iOS and Android runtime evidence.
- Signed iOS device smoke and Android device smoke evidence.
- Release-engineering sign-off and final v1.0 certification review.

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
