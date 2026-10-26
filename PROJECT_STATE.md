# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Current implementation gate

- **Current implementation baseline:** Phase 90 — DNS / Tunnel / Proxy Orchestration regression evidence merged; Phase 91 Application-Aware Path Selection evidence in progress.
- **Current main HEAD inspected (2026-10-26):** `60bb534781cd641a484b73ab1536a315cf03a17b` (post-Phase 90 merge).
- **Issue #12 progress:** The Phase 1–38 evidence register is incomplete: Phases 1–15 are mapped; Phases 16–38 still need evidence reconstruction. Historical paths and test-count records for Phases 39–78 do not establish phase acceptance on the current SHA. Those phases remain PARTIAL unless a separately documented external blocker applies, pending phase-specific acceptance verification and fresh exact-SHA CI evidence.
- **Current open issues (authoritative tracker):** #254 (Linux Client runtime wiring), #272 (EPIC: Autonomous Network Superplatform — Full-System Reconstruction & Completion), #284 (Workstream: Full Verification, CI/CD, Deployment & Final Evidence), #323 (Final External Validation Gate — Remote CI, Linux Runtime Soak & Release Evidence).
- **Phase 77 status:** implementation is complete and merged on `main`; the safety/rollback/recovery kernel is available from `@irp/resilience-runtime`.
- **Phase 78 status:** the bounded closed-loop controller is implemented and present on `main`.
- **Phase 79 status:** NetworkIntent model, lifecycle transitions, effective-window evaluation, autonomy levels and dedicated tests are implemented and present on `main` in `packages/core/src/intent.ts` and `intent.test.ts`. Exported from the core barrel.
- **Phase 80 status:** Intent API & Ingestion is implemented on `main` in `apps/api/src/intent-api.ts` (authenticated routes for create/list/get/commands, Idempotency-Key, in-memory and database stores, ownership isolation). Tests in `intent-api.test.ts`. No network mutation from the API boundary.
- **Phase 81 status:** Intent Translation / Compilation is implemented on `main` in `packages/resilience-runtime/src/intent/compiler.ts` (`compileNetworkIntent`, `isCompiledIntentEffective`). Pure, deterministic, side-effect free. Tests present.
- **Phase 82 status:** Intent-scoped Policy Decision & Enforcement is implemented on `main` via `packages/resilience-runtime/src/intent/governance.ts` and autonomy gates in arbitration. Admission decisions, stale rejection, mode-gated mutationAllowed. Tests present. Broader declarative policy language remains later roadmap work.
- **Phase 83 status:** Policy Conflict Resolution implementation present in `arbitration.ts` (arbitrateIntents, InMemoryIntentStore, PostgresIntentStore). Dedicated unit tests added covering no-conflict, priority supersession, version supersession, stale exclusion and store recording. Scopes overlap now requires matching key+value. Disposition PARTIAL pending CI evidence on current SHA.
- **Release state:** GitHub Releases `v0.2.0` and `v0.2.1` are developer-preview/prerelease evidence, not production certification. Production certification remains open. Current main SHA is `60bb534781cd641a484b73ab1536a315cf03a17b`; exact-SHA Release Gate evidence must be verified before any stronger release claim.
- **Phase 71 is a separate release-evidence gate:** it does not block architecture implementation in Phases 72–82, but it must not be represented as certified until its evidence exists.
- **Phases 83–150:** contracts for 79–92 exist; implementation for 83+ remains partial or not started. No new runtime authority introduced. ResilienceRuntime remains the sole production mutation authority.

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
