# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Current implementation gate

- **Current implementation baseline:** Phase 78 — Closed-Loop Control Foundation is implemented on `main`.
- **Current main HEAD reviewed this run:** `bce03ba51973c5be2f47037d539a8ddf38973ff8` (2026-10-17, after PR #38 merge).
- **Issue #12 progress:** Phase 1–38 acceptance evidence register complete with package/path/test anchors; phase-history-evidence-matrix mapped; phase-1-150-status-matrix regenerated. Dispositions remain PARTIAL pending fresh per-phase CI evidence and full acceptance verification. No COMPLETE claimed from documentation alone.
- **Current open issues (authoritative tracker):** #4 (post-v0.2.1 runtime/signing/production certification — largely external blockers), #12 (reconstruct per-phase acceptance evidence for Phases 1–38 / unmapped 39–78), #13 (define acceptance contracts for Phases 79–83 existing intent/policy capability), #14 (authorize contracts for Groups B–L / Phases 84–150).
- **Phase 77 status:** implementation is complete and merged on `main`; the safety/rollback/recovery kernel is available from `@irp/resilience-runtime`.
- **Phase 78 status:** the bounded closed-loop controller is implemented and present on `main`.
- **Issue #13 progress:** acceptance contracts for Phases 79–83 formalized and merged. Phase matrix reflects contracts; dispositions remain PARTIAL pending full verification evidence. No COMPLETE claimed from documentation alone.
- **Release state:** Phase 71 release-contract evidence exists: GitHub Release v0.2.1. Production certification (roadmap Step 6) remains open. Latest Release Gate on main is green.
- **Phase 71 is a separate release-evidence gate:** it does not block architecture implementation in Phases 72–78, but it must not be represented as certified until its evidence exists.
- **Issue #14 progress (2026-10-17):** Phase 84–93 acceptance contracts formalized (Phase 84 maps existing safety kernel + intent governance; Phase 85 formalizes assurance/drift contract; Phase 86 maps existing connectivity fabric; Phase 87 multi-interface; Phase 88 multi-path; Phase 89 gateway intelligence; Phase 90 DNS/tunnel/proxy orchestration; Phase 91 application-aware path selection; Phase 92 connectivity service assurance; Phase 93 advanced routing control). Remaining Phases 94–150 still require contracts and explicit authorization before implementation. Matrix update deferred until evidence exists. No new runtime authority introduced.

## Phase 78 objective

Phase 78 formalizes a bounded observe → decide → apply → verify/recover control loop around the existing `@irp/resilience-runtime` cycle. The loop controller owns only bounded repetition, cancellation and deterministic stop conditions. It must not create a second decision engine, policy engine, execution engine or global control plane.

## Current Phase 78 implementation

- `packages/resilience-runtime/src/closed-loop.ts` provides `BoundedClosedLoopController`.
- The controller is safe-by-default with a one-cycle default and a hard maximum of 10 cycles.
- Each cycle receives deterministic correlation and idempotency suffixes.
- Blocked and failed decisions terminate the loop immediately.
- Healthy terminal outcomes stop the loop by default.
- Cooperative cancellation prevents the next runtime cycle from starting.
- Dedicated tests are in `packages/resilience-runtime/tests/closed-loop.test.ts`.
- The public runtime barrel exports the controller.

## Phase 71 certification prerequisites

The Phase 71 gate is limited to the release/distribution contract defined by `docs/phases/phase-71.md`. Remaining production certification (device smoke, regional validation, signing, security sign-off) is tracked in issue #4 and `docs/release/RELEASE_GATE_ROADMAP.md`.

## Canonical evidence locations

- Current state: this file.
- Release path and blockers: `docs/release/RELEASE_GATE_ROADMAP.md`.
- Current post-70 roadmap: `docs/roadmap/MASTER_ROADMAP_V2.md`.
- Historical 0–70 roadmap: `ROADMAP.md`.
- Current phase records: `docs/phases/` (including formalized Phase 79–92 contracts under issues #13/#14).
- Engineering governance: `docs/architecture/engineering-governance.md`.

## Product objective

IRP's long-term objective is a safe, observable and policy-governed Internet control plane that can continuously measure network conditions, diagnose failures, select and apply bounded changes, verify the result, recover from failure and explain decisions across supported clients and network providers.

- **Issue #14 progress (2026-10-17):** Phase 86–92 contracts added (docs/phases/phase-86.md through phase-92.md). Maps existing fabric, routing, gateway, DNS, tunnel, application path, and assurance surfaces; no new runtime authority introduced. Matrix update deferred until evidence exists.
