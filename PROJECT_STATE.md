# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Current implementation gate

- **Current implementation baseline:** Phases 94–150 merged to `main` via PR #428 (branch `phase/94-150-implementation`). Each phase remains **PARTIAL** pending exact-SHA CI evidence and external runtime validation. Phase 93 and earlier baselines are unchanged. ResilienceRuntime remains the sole production mutation authority.
- **Current main HEAD inspected (2026-10-31):** `6432d32be2cd19f6bc2f1401666637ef7fc84f6b` (post-PR #428 merge + subsequent fixes).
- **Issue #12 progress:** The Phase 1–38 evidence register is incomplete: Phases 1–15 are mapped; Phases 16–38 still need evidence reconstruction. Historical paths and test-count records for Phases 39–78 do not establish phase acceptance on the current SHA. Those phases remain PARTIAL unless a separately documented external blocker applies, pending phase-specific acceptance verification and fresh exact-SHA CI evidence.
- **Current open issues (authoritative tracker):** #254 (Linux Client runtime wiring), #272 (EPIC: Autonomous Network Superplatform — Full-System Reconstruction & Completion), #284 (Workstream: Full Verification, CI/CD, Deployment & Final Evidence), #323 (Final External Validation Gate — Remote CI, Linux Runtime Soak & Release Evidence), #410/#411/#412 (durable stores / auth / PostgreSQL), #413 (reconcile project state), #420 (CodeQL workflow).
- **Phase 77 status:** implementation is complete and merged on `main`; the safety/rollback/recovery kernel is available from `@irp/resilience-runtime`.
- **Phase 78 status:** the bounded closed-loop controller is implemented and present on `main`.
- **Phase 79 status:** NetworkIntent model, lifecycle transitions, effective-window evaluation, autonomy levels and dedicated tests are implemented and present on `main` in `packages/core/src/intent.ts` and `intent.test.ts`. Exported from the core barrel.
- **Phase 80 status:** Intent API & Ingestion is implemented on `main` in `apps/api/src/intent-api.ts` (authenticated routes for create/list/get/commands, Idempotency-Key, in-memory and database stores, ownership isolation). Tests in `intent-api.test.ts`. No network mutation from the API boundary.
- **Phase 81 status:** Intent Translation / Compilation is implemented on `main` in `packages/resilience-runtime/src/intent/compiler.ts` (`compileNetworkIntent`, `isCompiledIntentEffective`). Pure, deterministic, side-effect free. Tests present.
- **Phase 82 status:** Intent-scoped Policy Decision & Enforcement is implemented on `main` via `packages/resilience-runtime/src/intent/governance.ts` and autonomy gates in arbitration. Admission decisions, stale rejection, mode-gated mutationAllowed. Tests present. Broader declarative policy language remains later roadmap work.
- **Phase 83 status:** Policy Conflict Resolution implementation present in `arbitration.ts` (arbitrateIntents, InMemoryIntentStore, PostgresIntentStore). Dedicated unit tests added covering no-conflict, priority supersession, version supersession, stale exclusion and store recording. Scopes overlap now requires matching key+value. Disposition PARTIAL pending CI evidence on current SHA.
- **Phase 92 status:** regression evidence for fabric health/freshness signals, observe-only intent drift detection, and re-selection through existing fabric.select boundary merged via PR #415. Disposition PARTIAL pending exact-SHA CI on owning package tests and full continuous assurance.
- **Release state:** GitHub Releases `v0.2.0` and `v0.2.1` are developer-preview/prerelease evidence, not production certification. Production certification remains open. Current main SHA is `6432d32be2cd19f6bc2f1401666637ef7fc84f6b`; exact-SHA Release Gate evidence must be verified before any stronger release claim.
- **Phase 71 is a separate release-evidence gate:** it does not block architecture implementation in Phases 72–150, but it must not be represented as certified until its evidence exists.
- **Phase 93 status:** advanced route ranking, bounded compiled-intent routing preferences, fail-closed validation, and selection audit evidence are implemented in `packages/resilience-runtime/src/fabric.ts`, with regression coverage in `phase-93-advanced-routing.test.ts`. Disposition PARTIAL pending exact-SHA CI and external runtime evidence. No new runtime authority was introduced.
- **Phases 94–150:** implemented and merged to `main` in `packages/resilience-runtime/src/{traffic,telemetry-plane,control-security,fleet,intelligence,dataplane,control-api,governance,scale}` with tests in `packages/resilience-runtime/tests/phase-94-99-*` through `phase-146-150-*` and records in `docs/phases/phase-94.md`…`phase-150.md`. All modules are additive, pure or injected-clock, advisory, and reach the network only through `PrivilegedMutationBoundary`; data-plane enforcement requires a governed transaction id. Disposition PARTIAL pending exact-SHA CI, review and external runtime evidence; no new runtime authority was introduced and `ResilienceRuntime` remains the sole production mutation authority.

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

## Autonomous engineer checkpoint (2026-10-25)

- Starting base SHA: 7872f2b298db0694cc869f4d491437770e752ad1 (upstream/main)
- Ending base SHA: (pending this PR)
- Completed this run: added Phase 87 multi-interface regression tests covering Interface selection by health, freshness filtering of stale interfaces, and platform/trust capability restrictions. Updated phase-87 evidence map. No runtime authority changes.
- Branches/PRs: phase/87-multi-interface-evidence (this PR)
- Actual CI: pending
- Verified merges: none this run (Phase 86 previously merged)
- Blockers: exact-SHA CI evidence; durable conflict-journal restart coverage for #13; Linux runtime soak (#254/#323).
- Next prioritized tasks: durable conflict journal restart tests; Phase 88 multi-path evidence or gaps; continue roadmap to Phase 150.

## Autonomous engineer checkpoint (2026-10-26)

- Starting base SHA: 3f1bae49a99631e063c028985a6ac559ddf94f41 (upstream/main)
- Ending base SHA: (pending this PR)
- Completed this run: added Phase 88 multi-path regression tests covering Route selection by health, stale path rejection, failure-domain diversity fail-closed behavior, and ApplicationPath kind exposure. Updated phase-88 evidence map. No runtime authority changes.
- Branches/PRs: phase/88-multi-path-regression-evidence (this PR)
- Actual CI: pending
- Verified merges: none this run
- Blockers: exact-SHA CI evidence; durable conflict-journal restart coverage for #13; Linux runtime soak (#254/#323).
- Next prioritized tasks: Phase 89 gateway intelligence evidence or gaps; continue roadmap to Phase 150; durable journal tests.

## Autonomous engineer checkpoint (2026-10-26 run 2)

- Starting base SHA: da42060aa31a7fef4ce917da6357de3f1b619a53 (upstream/main)
- Ending base SHA: (pending this PR)
- Completed this run: added Phase 89 gateway intelligence regression tests covering Gateway selection by health, stale gateway rejection, failure-domain diversity fail-closed behavior, and inventory attribute exposure (owner, failure domains). Updated phase-89 evidence map. No runtime authority changes.
- Branches/PRs: phase/89-gateway-intelligence-evidence (this PR)
- Actual CI: pending
- Verified merges: none this run (Phase 88 previously merged)
- Blockers: exact-SHA CI evidence; durable conflict-journal restart coverage for #13; Linux runtime soak (#254/#323).
- Next prioritized tasks: Phase 90 DNS/Tunnel/Proxy orchestration evidence or gaps; continue roadmap to Phase 150; durable journal tests.

## Autonomous engineer checkpoint (2026-10-26 run 3)

- Starting base SHA: 95d9c5edaa7b20f1d0baf0b1d6cbf63fcdd38a4e (upstream/main)
- Ending base SHA: (pending this PR)
- Completed this run: added Phase 90 DNS/Tunnel/Proxy orchestration regression tests covering Resolver/Tunnel/Proxy selection by health, stale rejection, failure-domain diversity fail-closed behavior, and inventory attribute exposure. Updated phase-90 evidence map. No runtime authority changes.
- Branches/PRs: phase/90-dns-tunnel-proxy-evidence (this PR)
- Actual CI: pending
- Verified merges: none this run (Phase 89 previously merged)
- Blockers: exact-SHA CI evidence; durable conflict-journal restart coverage for #13; Linux runtime soak (#254/#323).
- Next prioritized tasks: Phase 91 application-aware path selection evidence or gaps; continue roadmap to Phase 150; durable journal tests.

## Autonomous engineer checkpoint (2026-10-26 run 4)

- Starting base SHA: 60bb534781cd641a484b73ab1536a315cf03a17b (upstream/main)
- Ending base SHA: (pending this PR)
- Completed this run: added Phase 91 application-aware path selection regression tests covering ApplicationPath/Service/Endpoint selection by health, stale rejection, failure-domain diversity fail-closed behavior, and inventory attribute exposure including application metadata. Updated phase-91 evidence map. No runtime authority changes.
- Branches/PRs: phase/91-application-aware-path-evidence (this PR)
- Actual CI: pending
- Verified merges: none this run (Phase 90 previously merged)
- Blockers: exact-SHA CI evidence; durable conflict-journal restart coverage for #13; Linux runtime soak (#254/#323).
- Next prioritized tasks: Phase 92 connectivity service assurance evidence or gaps; continue roadmap to Phase 150; durable journal tests.

## Autonomous engineer checkpoint (2026-10-26 run 5)

- Starting base SHA: b5a484c22570c08c63364c2bd3be291d51af35ee (upstream/main, post-Phase 91 merge)
- Ending base SHA: (pending this PR)
- Completed this run: added Phase 92 connectivity service assurance regression tests covering fabric health/freshness as assurance signals, observe-only intent drift detection, and confirmation that re-selection remains on the existing fabric.select boundary (no parallel mutation path). Updated phase-92 evidence map and PROJECT_STATE baseline. No runtime authority changes.
- Branches/PRs: phase/92-connectivity-service-assurance-evidence (this PR)
- Actual CI: pending
- Verified merges: Phase 91 previously merged (PR #414)
- Blockers: exact-SHA CI evidence; durable conflict-journal restart coverage for #13; Linux runtime soak (#254/#323); production PostgreSQL / durable stores (#410/#411); auth lifecycle (#412).
- Next prioritized tasks: Phase 93 advanced routing control evidence or gaps (if contract exists) or durable store / auth blockers; continue roadmap to Phase 150.

## Autonomous engineer checkpoint (2026-10-27)

- Starting base SHA: 9d6c1d562e5c3b0e868cc03b3acd3993b0346a13 (upstream/main, post-#421)
- Ending base SHA: (pending this PR)
- Completed this run: reconciled PROJECT_STATE.md with live main SHA and Phase 92 merge (PR #415). Formalized that Phase 92 evidence is merged; next is Phase 93. No runtime authority changes.
- Branches/PRs: chore/update-project-state-phase-92-93 (this PR)
- Actual CI: pending
- Verified merges: Phase 92 previously merged (PR #415); CI fix #421 merged.
- Blockers: exact-SHA CI evidence; durable conflict-journal restart coverage; Linux runtime soak (#254/#323); production PostgreSQL / durable stores (#410); auth lifecycle (#412); CodeQL config (#420).
- Next prioritized tasks: formalize Phase 93 Advanced Routing Control contract + regression evidence; address #413 fully; continue roadmap to Phase 150.

## Autonomous engineer checkpoint (2026-10-31)

- Starting base SHA: 6432d32be2cd19f6bc2f1401666637ef7fc84f6b (upstream/main, post-PR #428 Phase 94–150 merge)
- Ending base SHA: (pending this PR)
- Completed this run: reconciled PROJECT_STATE.md and ACTIVE_WORK.md with live main SHA after Phases 94–150 were merged. Formalized that the implementation is on main and remains PARTIAL pending exact-SHA CI. No runtime authority changes.
- Branches/PRs: chore/update-project-state-post-94-150 (this PR)
- Actual CI: pending
- Verified merges: Phase 94–150 previously merged (PR #428).
- Blockers: exact-SHA CI evidence for all phases; durable PostgreSQL stores and auth lifecycle (#410/#411/#412); Linux runtime soak and external validation (#254/#323); CodeQL workflow (#420); full project state reconciliation (#413).
- Next prioritized tasks: address durable store / auth / PostgreSQL blockers; obtain exact-SHA CI evidence; continue external validation gates.
