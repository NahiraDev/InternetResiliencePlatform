# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Current implementation gate

- **Current implementation baseline:** Phases 94–150 implemented locally on branch `phase/94-150-implementation` (authorized by the repository owner's explicit request); each phase is PARTIAL pending exact-SHA CI evidence. Phase 93 and earlier baselines are unchanged. Modules and phase documents are present on current main.
- **Current main HEAD inspected (2026-11-05):** `28cbe4ebe343a352835f331eee72f1fbc09f8a0f`. Independent audit and the durable identity/auth work package are in `docs/audit/` (branch `fix/durable-identity-auth`, not merged; exact-SHA GitHub CI evidence pending).
- **Issue #12 progress:** The Phase 1–38 evidence register is incomplete: Phases 1–15 are mapped; Phases 16–38 still need evidence reconstruction. Historical paths and test-count records for Phases 39–78 do not establish phase acceptance on the current SHA. Those phases remain PARTIAL unless a separately documented external blocker applies, pending phase-specific acceptance verification and fresh exact-SHA CI evidence.
- **Current open issues (authoritative tracker):** #254 (Linux Client runtime wiring), #272 (EPIC: Autonomous Network Superplatform — Full-System Reconstruction & Completion), #284 (Workstream: Full Verification, CI/CD, Deployment & Final Evidence), #323 (Final External Validation Gate — Remote CI, Linux Runtime Soak & Release Evidence), #410/#411/#412 (durable stores / auth / PostgreSQL), #413 (reconcile project state), #420 (CodeQL workflow). Open PR #480 addresses gateway lifecycle and some durable store work (PARTIAL; CI unstable).
- **Phase 77 status:** implementation is complete and merged on `main`; the safety/rollback/recovery kernel is available from `@irp/resilience-runtime`.
- **Phase 78 status:** the bounded closed-loop controller is implemented and present on `main`.
- **Phase 79 status:** NetworkIntent model, lifecycle transitions, effective-window evaluation, autonomy levels and dedicated tests are implemented and present on `main` in `packages/core/src/intent.ts` and `intent.test.ts`. Exported from the core barrel.
- **Phase 80 status:** Intent API & Ingestion is implemented on `main` in `apps/api/src/intent-api.ts` (authenticated routes for create/list/get/commands, Idempotency-Key, in-memory and database stores, ownership isolation). Tests in `intent-api.test.ts`. No network mutation from the API boundary.
- **Phase 81 status:** Intent Translation / Compilation is implemented on `main` in `packages/resilience-runtime/src/intent/compiler.ts` (`compileNetworkIntent`, `isCompiledIntentEffective`). Pure, deterministic, side-effect free. Tests present.
- **Phase 82 status:** Intent-scoped Policy Decision & Enforcement is implemented on `main` via `packages/resilience-runtime/src/intent/governance.ts` and autonomy gates in arbitration. Admission decisions, stale rejection, mode-gated mutationAllowed. Tests present. Broader declarative policy language remains later roadmap work.
- **Phase 83 status:** Policy Conflict Resolution implementation present in `arbitration.ts` (arbitrateIntents, InMemoryIntentStore, PostgresIntentStore). Dedicated unit tests added covering no-conflict, priority supersession, version supersession, stale exclusion and store recording. Scopes overlap now requires matching key+value. Disposition PARTIAL pending CI evidence on current SHA.
- **Phase 92 status:** regression evidence for fabric health/freshness signals, observe-only intent drift detection, and re-selection through existing fabric.select boundary merged via PR #415. Disposition PARTIAL pending exact-SHA CI on owning package tests and full continuous assurance.
- **Release state:** GitHub Releases `v0.2.0` and `v0.2.1` are developer-preview/prerelease evidence, not production certification. Production certification remains open. Current main SHA is `28cbe4ebe343a352835f331eee72f1fbc09f8a0f`; exact-SHA Release Gate evidence must be verified before any stronger release claim.
- **Phase 71 is a separate release-evidence gate:** it does not block architecture implementation in Phases 72–92, but it must not be represented as certified until its evidence exists.
- **Phase 93 status:** advanced route ranking, bounded compiled-intent routing preferences, fail-closed validation, and selection audit evidence are implemented in `packages/resilience-runtime/src/fabric.ts`, with regression coverage in `phase-93-advanced-routing.test.ts`. Disposition PARTIAL pending exact-SHA CI and external runtime evidence. No new runtime authority was introduced.
- **Phases 94–150:** phase documents and corresponding modules exist on main under `packages/resilience-runtime/src/{traffic,telemetry-plane,control-security,fleet,intelligence,dataplane,control-api,governance,scale}` with tests. All modules are additive, pure or injected-clock, advisory, and reach the network only through `PrivilegedMutationBoundary`; data-plane enforcement requires a governed transaction id. Disposition PARTIAL pending exact-SHA CI, review and external runtime evidence; no new runtime authority was introduced and `ResilienceRuntime` remains the sole production mutation authority.

## Phase 79–83 summary

Phases 79–83 establish the intent model, API ingestion boundary, pure compilation to CompiledIntent, intent-scoped admission/enforcement, and deterministic multi-intent conflict resolution (priority/version supersession, overlapping scope detection) without introducing a second control plane. Downstream phases must consume these contracts.

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

## Autonomous engineer checkpoint (2026-11-05)

- Starting base SHA: 28cbe4ebe343a352835f331eee72f1fbc09f8a0f (upstream/main)
- Ending base SHA: (pending this PR)
- Completed this run: inspected live main at 28cbe4eb; confirmed phases 94–150 modules (scale/, traffic/, etc.), phase documents, and tests are present on main. Disposition remains PARTIAL pending exact-SHA CI evidence on current head. Open PR #480 (gateway/durable work) is unstable with multiple CI failures (Linux netns, iOS, Android, Swift, Java analyses). No runtime authority changes. Updated PROJECT_STATE.md with live SHA and current open issues/PRs.
- Branches/PRs: chore/reconcile-project-state-28cbe4eb (this PR)
- Actual CI: pending on this branch
- Verified merges: none this run
- Blockers: exact-SHA CI evidence on phase tests; CodeQL default-vs-advanced conflict (#420); durable PostgreSQL stores fully wired and evidenced (#410/#411); auth lifecycle production evidence (#412); Linux runtime soak (#254/#323); CI stability on large PRs.
- Next prioritized tasks: stabilize or supersede PR #480; obtain exact-SHA green CI on resilience-runtime phase tests; address CodeQL workflow conflict without weakening gates; continue durable store implementation with proper tests; Linux client wiring verification.

## Autonomous engineer checkpoint (2026-11-01 run 2)

- Starting base SHA: 3a5ce2dd3c4f14356e374c6853a77fb0119951d1 (upstream/main)
- Ending base SHA: (pending this PR #442)
- Completed this run: inspected live state; confirmed phases 94–150 modules and docs are on main; PR #442 is open reconciling PROJECT_STATE. CI on head 7c528b1b shows architecture enforcement failure (not reproduced locally on same content), CodeQL SARIF processing failure (related to #420 default-setup conflict), and Vercel authorization required. No code changes this update.
- Branches/PRs: chore/reconcile-project-state-current-main (PR #442)
- Actual CI: FAIL on architecture step and CodeQL; other client jobs success.
- Verified merges: none this run
- Blockers: exact-SHA CI evidence; CodeQL config (#420); durable stores (#410); auth (#412); Linux soak (#254/#323).
- Next prioritized tasks: resolve CodeQL default vs advanced conflict without weakening gate; verify phase test suites pass on current SHA; address durable persistence.
