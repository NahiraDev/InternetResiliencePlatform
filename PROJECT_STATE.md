# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Current implementation gate

- **Current implementation baseline:** Phase 78 — Closed-Loop Control Foundation is implemented on `main`.
- **Current main HEAD reviewed this run:** `6c1bbfd7b4a27d2336b49a1c43ba0fc14be7d372` (merge of PR #27: docs refresh PROJECT_STATE and phase matrix to HEAD 19392bc).
- **Issue #12 progress:** Phase 1–38 acceptance evidence register complete with package/path/test anchors; phase-history-evidence-matrix mapped; phase-1-150-status-matrix regenerated on current HEAD. Dispositions remain PARTIAL pending fresh per-phase CI evidence and full acceptance verification. No COMPLETE claimed from documentation alone.
- **Current open issues (authoritative tracker):** #4 (post-v0.2.1 runtime/signing/production certification — largely external blockers), #12 (reconstruct per-phase acceptance evidence for Phases 1–38 / unmapped 39–78), #13 (define acceptance contracts for Phases 79–83 existing intent/policy capability), #14 (authorize contracts for Groups B–L / Phases 84–150).
- **Phase 77 status:** implementation is complete and merged on `main`; the safety/rollback/recovery kernel is available from `@irp/resilience-runtime`.
- **Phase 78 status:** the bounded closed-loop controller is implemented and present on `main`.
- **Issue #13 progress (this run):** acceptance contracts for Phases 79–83 formalized and merged (PR #22). Phase matrix regenerated on current HEAD to reflect contracts; dispositions remain PARTIAL pending full verification evidence. No COMPLETE claimed from documentation alone.
- **Release state:** Phase 71 release-contract evidence exists: GitHub Release [v0.2.1](https://github.com/nimarahimloo/InternetResiliencePlatform/releases/tag/v0.2.1). Production certification (roadmap Step 6) remains open.
- **Phase 71 is a separate release-evidence gate:** it does not block architecture implementation in Phases 72–78, but it must not be represented as certified until its evidence exists.
- **Issue #14 progress (this run):** Phase 84 and Phase 85 acceptance contracts formalized on branch `docs/phase-84-acceptance-contract` (Phase 84 maps existing safety kernel + intent governance; Phase 85 formalizes assurance/drift contract). Remaining Phases 86–150 still require contracts and explicit authorization before implementation.

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
- Current phase records: `docs/phases/` (including formalized Phase 79–83 contracts under issue #13).
- Engineering governance: `docs/architecture/engineering-governance.md`.

## Product objective

IRP's long-term objective is a safe, observable and policy-governed Internet control plane that can continuously measure network conditions, diagnose failures, select and apply bounded changes, verify the result, recover from failure and explain decisions across supported clients and network providers.

- **Issue #12 progress (2026-10-14):** Acceptance evidence register extended through Phases 1–38 (branches issue-12-extend-evidence-register-phases-1-15 / -16-25 and this continuation). History matrix set to mapped for all 1–38. Dispositions remain PARTIAL pending fresh CI evidence. No COMPLETE claimed from documentation alone.
