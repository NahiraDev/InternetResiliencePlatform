# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Current implementation gate

- **Current implementation baseline:** Phase 78 — Closed-Loop Control Foundation is implemented on `main`.
- **Current main HEAD reviewed this run:** `2c8610ce2b3e6c7b603dbfcb575366b687886792` (2026-10-18, merge of PR #55 resolving intent scope arbitration and conflict ownership leaks, plus PR #57 correcting intent e2e ownership context/autonomy/spy and reconciling state to prior SHA).
- **Issue #12 progress:** Phase 1–38 acceptance evidence register complete with package/path/test anchors; phase-history-evidence-matrix mapped; phase-1-150-status-matrix regenerated. Dispositions remain PARTIAL pending fresh per-phase CI evidence and full acceptance verification. No COMPLETE claimed from documentation alone.
- **Current open issues (authoritative tracker):** #4 (post-v0.2.1 runtime/signing/production certification — largely external blockers), #12 (reconstruct per-phase acceptance evidence for Phases 1–38 / unmapped 39–78), #13 (define acceptance contracts for Phases 79–83 existing intent/policy capability), #14 (authorize contracts for Groups B–L / Phases 84–150).
- **Phase 77 status:** implementation is complete and merged on `main`; the safety/rollback/recovery kernel is available from `@irp/resilience-runtime`.
- **Phase 78 status:** the bounded closed-loop controller is implemented and present on `main`.
- **Issue #13 progress:** acceptance contracts for Phases 79–83 formalized and merged. Phase matrix reflects contracts; dispositions remain PARTIAL pending full verification evidence. No COMPLETE claimed from documentation alone. E2E ownership/stale coverage and governance contract alignment (trusted live context + SAFE_AUTOMATION, runtime.cycle spy) landed via PR #56/#57; intent scope arbitration and conflict ownership fixes merged in PR #55. Real PostgreSQL durability remains externally blocked.
- **Release state:** GitHub Releases `v0.2.0` and `v0.2.1` are developer-preview/prerelease evidence, not production certification. Production certification (roadmap Step 6) remains open. The previously observed Release Gate failed because API typecheck failed; no passing Release Gate evidence has yet been observed for the repair branch's current SHA.
- **Phase 71 is a separate release-evidence gate:** it does not block architecture implementation in Phases 72–78, but it must not be represented as certified until its evidence exists.
- **Issue #14 progress (2026-10-18):** Phase contracts 84–92 exist; all remain PARTIAL pending implementation/acceptance evidence. Phase 85 observe-only drift detection is integrated into the closed-loop controller with per-cycle assessment collection (PR in progress). Phases 93–150 still require contracts and explicit authorization before implementation. No new runtime authority introduced.

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
- Observe-only Phase 85 drift assessments are optionally collected and attached without triggering mutation.

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
- **Matrix regeneration (2026-10-17):** phase-1-150-status-matrix.md and phase-status-matrix.json regenerated from authoritative generator against verified HEAD 2a8728214bf57347049dcfbba0fdf5e367db60f7. Dispositions unchanged (Phase 85 remains PARTIAL with observe-only drift + closed-loop integration present). Regeneration against current HEAD 2c8610c is pending; dispositions do not change from documentation alone.
