# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Current implementation gate

- **Current implementation baseline:** Phase 78 — Closed-Loop Control Foundation is implemented on `main`.
- **Current main HEAD inspected (2026-10-17):** `4011e6021f9ce84273398288ba85fa86ccc382e0` (merge commit for PR #375). The workspace-read rate-limit TypeScript error was fixed in PR #373; PR #375 then fixed the unknown-objective drift-severity regression. PR-SHA CI and Deep Audit passed before merge. Post-merge workflows are now running on the exact main SHA; no passing Release Gate result has yet been verified for this SHA.
- **Issue #12 progress:** The Phase 1–38 evidence register is incomplete: Phases 1–15 are mapped; Phases 16–38 still need evidence reconstruction. Historical paths and test-count records for Phases 39–78 do not establish phase acceptance on the current SHA. Those phases remain PARTIAL unless a separately documented external blocker applies, pending phase-specific acceptance verification and fresh exact-SHA CI evidence.
- **Current open issues (authoritative tracker):** #4 (post-v0.2.1 runtime/signing/production certification — largely external blockers), #12 (reconstruct per-phase acceptance evidence for Phases 1–38 / unmapped 39–78), #13 (define acceptance contracts for Phases 79–83 existing intent/policy capability), #14 (verify Phases 84–92 and define/authorize contracts for Phases 93–150).
- **Phase 77 status:** implementation is complete and merged on `main`; the safety/rollback/recovery kernel is available from `@irp/resilience-runtime`.
- **Phase 78 status:** the bounded closed-loop controller is implemented and present on `main`.
- **Issue #13 progress:** acceptance contracts for Phases 79–83 formalized and merged. Phase matrix reflects contracts; dispositions remain PARTIAL pending full verification evidence. No COMPLETE claimed from documentation alone.
- **Release state:** GitHub Releases `v0.2.0` and `v0.2.1` are developer-preview/prerelease evidence, not production certification. Production certification (roadmap Step 6) remains open. PR #375 is on main at `4011e6021f9ce84273398288ba85fa86ccc382e0`; post-merge workflow results and a passing exact-SHA Release Gate must be verified before any stronger release claim.
- **Phase 71 is a separate release-evidence gate:** it does not block architecture implementation in Phases 72–78, but it must not be represented as certified until its evidence exists.
- **Issue #14 progress (2026-10-17):** Phase contracts 84–92 exist; all remain PARTIAL pending implementation/acceptance evidence. Phases 93–150 remain NOT STARTED until contracts and explicit authorization exist. The checked-in 150-row matrix manually reconciles dispositions against reviewed baseline `b854e4c8ff1e7b45c0f5059a97476171bfb568c9`; it is not generated output in this connector session. Its sourceSha is unset, historical probe inventory is not fresh CI evidence, and the canonical generator must run on the final merged PR head. No new runtime authority introduced.

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

- **Matrix reconciliation (2026-10-17):** The placeholder was replaced and both human/machine matrices now cover 150 phases. Summary: 88 PARTIAL, 3 BLOCKED, 1 COMPLETE (Phase 71's distribution contract), 58 NOT STARTED. The generator's full reference probe inventory has not yet been executed against the final merged PR head; historical probe data must not be presented as fresh CI evidence.
