# Phases 45–70 — Execution Contracts

These are planned contracts, not implementation claims. Each phase becomes a historical implementation record when work starts.

## 45 — Network Identity & Destination Policy Assurance
- Scope: prove egress identity, destination identity and policy applicability independently.
- Depends on: 39, 41, 43, 44.
- Gate: policy decisions consume verified identity/evidence and reject ambiguous regional claims.

## 46 — Gateway Registry
- Scope: inventory authorized gateways, ownership, capabilities, lifecycle and metadata.
- Depends on: 26, 39, 45.
- Gate: gateway records have stable identity and authorization state.

## 47 — Gateway Discovery & Health
- Scope: discovery, reachability, quality scoring and stale-node handling.
- Depends on: 46, 7, 15.
- Gate: unhealthy/stale gateways cannot become active candidates.

## 48 — Secure Tunnel Abstraction
- Scope: provider-neutral establish/verify/maintain/rotate/teardown contract.
- Depends on: 46, 47, 19, 26.
- Gate: provider adapters share one lifecycle and security contract.

## 49 — WireGuard Provider
- Scope: production adapter, key lifecycle, health verification and safe teardown.
- Depends on: 48, 55 security requirements.
- Gate: authorized gateway tunnel can be established, verified and recovered without leaking key material.

## 50 — Additional Tunnel Providers
- Scope: pluggable support for other legitimate supported backends without coupling Core to a vendor.
- Depends on: 48.
- Gate: provider conformance suite passes.

## 51 — Automatic Gateway Selection
- Scope: select authorized gateways using health, latency, loss, stability, capacity and regional evidence.
- Depends on: 45–50.
- Gate: selection is deterministic/bounded and policy-aware; no ping-only decisions.

## 52 — Tunnel Lifecycle Automation
- Scope: establish, verify, maintain, rotate, reconnect and safely tear down tunnels.
- Depends on: 48–51.
- Gate: lifecycle survives transient failure and leaves no unsafe partial state.

## 53 — Multi-Gateway Failover
- Scope: health-aware failover with hysteresis, cooldowns, recovery budgets and rollback.
- Depends on: 16, 51, 52.
- Gate: controlled-fault tests prove no uncontrolled flapping or unsafe mutation.

## 54 — Gateway Fleet Operations
- Scope: provisioning metadata, maintenance, drain/disable, upgrades and capacity.
- Depends on: 46–53, 60.
- Gate: operator can safely remove/upgrade a gateway without breaking active clients unexpectedly.

## 55 — Gateway Security & Compliance
- Scope: least privilege, key protection, hardening, auditability and supply-chain verification.
- Depends on: 39, 48–54.
- Gate: security review and automated policy checks pass.

## 56 — Unified Product API
- Scope: one versioned capability API consumed by Web, Desktop and Mobile.
- Depends on: 26, 39, 45, 48–55.
- Gate: capability/authorization contracts are platform-neutral and versioned.

## 57 — Web Control Center
- Scope: dashboard, devices, gateways, policies, routes, tunnels, analytics, diagnostics and audit.
- Depends on: 56.
- Gate: Web exposes Core capabilities without implementing safety-critical decision logic.

## 58 — Identity, RBAC & Multi-Device Sync
- Scope: users, roles, sessions, device authorization, synchronized configuration and conflict handling.
- Depends on: 39, 42, 56.
- Gate: authorization is enforced server-side and sync is deterministic/auditable.

## 59 — Notifications & Incident Center
- Scope: degradation, recovery, security and actionable diagnostics notifications.
- Depends on: 56–58, 34–38.
- Gate: notifications are deduplicated, bounded and permission-aware.

## 60 — Administration & Self-Hosting
- Scope: deployment, configuration, migrations, backups, restore and operator tooling.
- Depends on: 54, 56–59.
- Gate: clean install/upgrade/rollback and restore are documented and tested.

## 61 — Linux Full Client
- Scope: native/system integration, background agent, tray/UI, diagnostics and policy controls.
- Depends on: 56–60.
- Gate: Linux client consumes shared capabilities and never duplicates Core routing logic.

## 62 — macOS Full Client
- Scope: native integration, lifecycle, networking hooks and diagnostics.
- Depends on: 56–60.
- Gate: platform adapter is isolated and signed/reproducible according to release policy.

## 63 — Windows Full Client
- Scope: native service lifecycle, networking hooks and diagnostics.
- Depends on: 56–60.
- Gate: service lifecycle and recovery are reliable across restart/update scenarios.

## 64 — Shared Mobile Client Core
- Scope: shared capability contracts, secure storage abstraction, sync, offline state and API lifecycle.
- Depends on: 56–60.
- Gate: mobile clients share contracts without copying Core decision logic.

## 65 — iOS Full Client
- Scope: native UI, enrollment, analytics, policies, diagnostics, gateway/tunnel state, notifications and device management.
- Depends on: 64.
- Gate: all permitted shared capabilities are exposed through native iOS UX and security controls.

## 66 — iOS Network Integration
- Scope: Network Extension-based integration where permitted by Apple APIs, including lifecycle and health/failover adapters.
- Depends on: 48–55, 65.
- Gate: platform entitlements, lifecycle, tunnel health and recovery are verified on supported iOS versions.

## 67 — Android Full Client
- Scope: native UI, secure storage, enrollment, analytics, policies, diagnostics, gateway/tunnel state and device lifecycle.
- Depends on: 64.
- Gate: all permitted shared capabilities are exposed through native Android UX and security controls.

## 68 — Android VPN/Network Integration
- Scope: Android-native VPN/network lifecycle, health and failover adapter.
- Depends on: 48–55, 67.
- Gate: service lifecycle, reconnect, health and controlled failover pass device-level tests.

## 69 — Cross-Platform Production Hardening
- Scope: performance, accessibility, localization, compatibility, security audit, upgrade/rollback, chaos/soak, backup/restore and release engineering.
- Depends on: 45–68.
- Gate: supported matrix passes reliability/security/recovery SLOs.

## 70 — IRP v1.0 Production Certification
- Scope: end-to-end certification across Core, API, gateways, Web, Linux, macOS, Windows, iOS and Android.
- Depends on: 69 and every prior release gate.
- Gate: documented SLOs, security gates, recovery proof, regional evidence, upgrade/rollback proof and continuous CI verification.

## Universal rule

A phase is complete only when implementation, tests, documentation, repository checks, CI and required runtime/platform evidence all pass. Planned phase documents must never be interpreted as evidence that the phase is implemented.
