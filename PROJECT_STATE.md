# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Current implementation gate

- **Current implementation baseline:** Phase 79 — Intent Model & Lifecycle is implemented on `main`.
- **Current main HEAD inspected (2026-10-20):** `fd73eacd9acc643416856ac2806d797febcef348` (merge of phase matrix regeneration). Phase 79 NetworkIntent model, lifecycle, effective-window semantics, autonomy levels and tests are present in `@irp/core`.
- **Issue #12 progress:** The Phase 1–38 evidence register is incomplete: Phases 1–15 are mapped; Phases 16–38 still need evidence reconstruction. Historical paths and test-count records for Phases 39–78 do not establish phase acceptance on the current SHA. Those phases remain PARTIAL unless a separately documented external blocker applies, pending phase-specific acceptance verification and fresh exact-SHA CI evidence.
- **Current open issues (authoritative tracker):** #254 (Linux Client runtime wiring), #272 (EPIC: Autonomous Network Superplatform — Full-System Reconstruction & Completion), #284 (Workstream: Full Verification, CI/CD, Deployment & Final Evidence), #323 (Final External Validation Gate — Remote CI, Linux Runtime Soak & Release Evidence).
- **Phase 77 status:** implementation is complete and merged on `main`; the safety/rollback/recovery kernel is available from `@irp/resilience-runtime`.
- **Phase 78 status:** the bounded closed-loop controller is implemented and present on `main`.
- **Phase 79 status:** NetworkIntent model, lifecycle transitions, effective-window evaluation, autonomy levels and dedicated tests are implemented and present on `main` in `packages/core/src/intent.ts` and `intent.test.ts`. Exported from the core barrel.
- **Release state:** GitHub Releases `v0.2.0` and `v0.2.1` are developer-preview/prerelease evidence, not production certification. Production certification remains open. Current main SHA is `fd73eacd9acc643416856ac2806d797febcef348`; exact-SHA Release Gate evidence must be verified before any stronger release claim.
- **Phase 71 is a separate release-evidence gate:** it does not block architecture implementation in Phases 72–79, but it must not be represented as certified until its evidence exists.
- **Phases 80–150:** contracts for 79–92 exist; implementation for 80+ remains partial or not started. No new runtime authority introduced. ResilienceRuntime remains the sole production mutation authority.

## Phase 79 objective

Phase 79 defines the canonical, typed network-intent model and deterministic lifecycle. An intent expresses a desired network outcome without embedding policy evaluation, planning or low-level execution details. The model is in `@irp/core` and must not become a parallel control plane.

## Current Phase 79 implementation

- `packages/core/src/intent.ts` provides `NetworkIntent`, `createNetworkIntent`, `transitionIntent`, `isIntentEffective`, `isIntentTerminal`, `isAutonomyPermitted`.
- Lifecycle transitions are explicit and fail-closed.
- Effective window uses half-open `[effectiveFrom, expiresAt)` semantics.
- Autonomy levels and objective weights are validated.
- Dedicated tests in `packages/core/src/intent.test.ts`.
- Public exports from `packages/core/src/index.ts`.

## Phase 71 certification prerequisites

The Phase 71 gate is limited to the release/distribution contract defined by `docs/phases/phase-71.md`. Remaining production certification (device smoke, regional validation, signing, security sign-off) is tracked in open issues and `docs/release/RELEASE_GATE_ROADMAP.md`.

## Canonical evidence locations

- Current state: this file.
- Release path and blockers: `docs/release/RELEASE_GATE_ROADMAP.md`.
- Current post-70 roadmap: `docs/roadmap/MASTER_ROADMAP_V2.md`.
- Historical 0–70 roadmap: `ROADMAP.md`.
- Current phase records: `docs/phases/`.
- Engineering governance: `docs/architecture/engineering-governance.md`.

## Product objective

IRP's long-term objective is a safe, observable and policy-governed Internet control plane that can continuously measure network conditions, diagnose failures, select and apply bounded changes, verify the result, recover from failure and explain decisions across supported clients and network providers.

## Architecture invariants (unchanged)

- ResilienceRuntime remains the canonical runtime authority.
- Never restore NetworkAutopilot as a parallel production control plane.
- No competing authorities for runtime state, policy, decisions, safety, mutation, execution, verification, recovery, intent, or orchestration.
