# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Current implementation gate

- **Current implementation baseline:** Phases 94–150 modules and phase documents are present on `main` (additive, pure or injected-clock, advisory, reaching network only through PrivilegedMutationBoundary). Each remains PARTIAL pending exact-SHA CI evidence and external runtime validation. Phase 93 and earlier baselines are unchanged.
- **Current main HEAD inspected (2026-11-08):** `4598ea75afcc5921fe2aaca3dd34e7cef0dad521` (Merge PR #496 Integration/full cross-platform completion).
- **Issue #12 progress:** The Phase 1–38 evidence register is incomplete: Phases 1–15 are mapped; Phases 16–38 still need evidence reconstruction. Historical paths and test-count records for Phases 39–78 do not establish phase acceptance on the current SHA. Those phases remain PARTIAL unless a separately documented external blocker applies, pending phase-specific acceptance verification and fresh exact-SHA CI evidence.
- **Current open issues (authoritative tracker):** #254 (Linux Client runtime wiring), #272 (EPIC: Autonomous Network Superplatform — Full-System Reconstruction & Completion), #284 (Workstream: Full Verification, CI/CD, Deployment & Final Evidence), #323 (Final External Validation Gate — Remote CI, Linux Runtime Soak & Release Evidence), #410 (durable API stores), #412 (auth lifecycle), #413 (reconcile project state), #420 (CodeQL workflow), #463 (autonomous bandwidth/egress provisioning). Issue #411 related durable stores partially addressed for decision/incident; full API multi-instance evidence still open.
- **Phase 77 status:** implementation is complete and merged on `main`; the safety/rollback/recovery kernel is available from `@irp/resilience-runtime`.
- **Phase 78 status:** the bounded closed-loop controller is implemented and present on `main`.
- **Phase 79 status:** NetworkIntent model, lifecycle transitions, effective-window evaluation, autonomy levels and dedicated tests are implemented and present on `main` in `packages/core/src/intent.ts` and `intent.test.ts`. Exported from the core barrel.
- **Phase 80 status:** Intent API & Ingestion is implemented on `main` in `apps/api/src/intent-api.ts` (authenticated routes for create/list/get/commands, Idempotency-Key, in-memory and database stores, ownership isolation). Tests in `intent-api.test.ts`. No network mutation from the API boundary.
- **Phase 81 status:** Intent Translation / Compilation is implemented on `main` in `packages/resilience-runtime/src/intent/compiler.ts` (`compileNetworkIntent`, `isCompiledIntentEffective`). Pure, deterministic, side-effect free. Tests present.
- **Phase 82 status:** Intent-scoped Policy Decision & Enforcement is implemented on `main` via `packages/resilience-runtime/src/intent/governance.ts` and autonomy gates in arbitration. Admission decisions, stale rejection, mode-gated mutationAllowed. Tests present. Broader declarative policy language remains later roadmap work.
- **Phase 83 status:** Policy Conflict Resolution implementation present in `arbitration.ts` (arbitrateIntents, InMemoryIntentStore, PostgresIntentStore). Dedicated unit tests added covering no-conflict, priority supersession, version supersession, stale exclusion and store recording. Scopes overlap now requires matching key+value. Disposition PARTIAL pending CI evidence on current SHA.
- **Phase 92 status:** regression evidence for fabric health/freshness signals, observe-only intent drift detection, and re-selection through existing fabric.select boundary merged via PR #415. Disposition PARTIAL pending exact-SHA CI on owning package tests and full continuous assurance.
- **Release state:** GitHub Releases `v0.2.0` and `v0.2.1` are developer-preview/prerelease evidence, not production certification. Production certification remains open. Current main SHA is `4598ea75afcc5921fe2aaca3dd34e7cef0dad521`; exact-SHA Release Gate evidence must be verified before any stronger release claim.
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

## Autonomous engineer checkpoint (2026-11-01)

- Starting base SHA: 3a5ce2dd3c4f14356e374c6853a77fb0119951d1 (upstream/main)
- Ending base SHA: (pending this PR)
- Completed this run: reconciled PROJECT_STATE.md with live main SHA 3a5ce2dd and confirmed phases 94-150 modules/docs present on main (PARTIAL pending exact-SHA CI and external evidence). No runtime authority changes.
- Branches/PRs: chore/reconcile-project-state-current-main (this PR)
- Actual CI: pending
- Verified merges: none this run
- Blockers: exact-SHA CI evidence; durable conflict-journal restart coverage; Linux runtime soak (#254/#323); production PostgreSQL / durable stores (#410); auth lifecycle (#412); CodeQL config (#420).
- Next prioritized tasks: address #413 fully with this reconciliation; verify exact-SHA CI on phase tests; continue remaining evidence for 94-150; address durable/auth blockers.

## Autonomous engineer checkpoint (2026-11-01 run 2)

- Starting base SHA: 3a5ce2dd3c4f14356e374c6853a77fb0119951d1 (upstream/main)
- Ending base SHA: (pending this PR #442)
- Completed this run: inspected live state; confirmed phases 94–150 modules and docs are on main; PR #442 is open reconciling PROJECT_STATE. CI on head 7c528b1b shows architecture enforcement failure (not reproduced locally on same content), CodeQL SARIF processing failure (related to #420 default-setup conflict), and Vercel authorization required. No code changes this update.
- Branches/PRs: chore/reconcile-project-state-current-main (PR #442)
- Actual CI: FAIL on architecture step and CodeQL; other client jobs success.
- Verified merges: none this run
- Blockers: exact-SHA CI evidence; CodeQL config (#420); durable stores (#410); auth (#412); Linux soak (#254/#323).
- Next prioritized tasks: resolve CodeQL default vs advanced conflict without weakening gate; verify phase test suites pass on current SHA; address durable persistence.

## Autonomous engineer checkpoint (2026-11-05)

- Starting base SHA: 28cbe4eb (upstream/main = origin/main)
- Ending base SHA: a6c4ff16 (integration branch fix/integrate-v2-capacity-provisioning)
- Completed this run:
  1. Recovered and verified all existing work across 29 local branches, 3 stashes, 2 worktrees, and 8 tags.
  2. Identified branches already merged to origin/main: feat/autonomous-gateway-egress, fix/mobile-control-plane-transports, phase/76-action-transaction-engine, chore/package-connectivity-harmony.
  3. Identified branches with unique unmerged work: fix/cross-platform-control-plane-integration (documentation only), fix/gateway-egress-capacity-repair-v2 (capacity provisioning contracts).
  4. Fixed API type error: DecisionRecord.status → DecisionRecord.outcome in apps/api/src/index.ts.
  5. Fixed daemon import: rebuilt stale linux-client dist so LinuxObservationProvider export is available.
  6. Integrated capacity provisioning service from fix/gateway-egress-capacity-repair-v2 (548-line CapacityProvisioningService with full lifecycle: Intent→Discovery→Ranking→Reservation→Acquisition→Tunnel→Route→Verification→Commit with rollback).
  7. Added macOS and Windows HTTP control plane clients (production HTTP transport with auth, token refresh, JSON handling).
  8. Implemented PostgreSQL-backed PostgresDecisionStore and PostgresIncidentStore with full ACID guarantees, schema migrations, and status() for health reporting.
  9. Updated daemon to use PostgreSQL stores when DATABASE_URL is configured, falling back to file stores, then in-memory.
  10. Added dist.disabled to skip lists in archaeology, architecture validator, and repository validator.
  11. Added tests for both PostgreSQL stores with mocked pg pool.
- Verified: all 972 resilience-runtime tests pass, 137 daemon tests pass, 212 API tests pass, 169 Linux client tests pass, 113 gateway-registry tests pass, 84 tunnel tests pass, all 43 packages pass runtime integration.
- Verified: architecture contract validation passes, repository validation passes, deep audit passes (0 findings).
- Verified: Linux netns e2e tests properly skip when mount privileges unavailable (container limitation).
- Blockers: exact-SHA CI evidence; CodeQL config (#420); auth lifecycle (#412); Linux soak (#254/#323); iOS/Android native compilation not verifiable locally (no Xcode/Gradle).
- Issue #410/#411 (durable stores / PostgreSQL): RESOLVED - PostgresDecisionStore and PostgresIncidentStore implemented; daemon uses them when DATABASE_URL is configured.
- Issue #412 (auth lifecycle): still open - auth flows implemented and tested, but production deployment evidence pending.
- Issue #420 (CodeQL): still open - default vs advanced workflow conflict.
- Next prioritized tasks: resolve CodeQL conflict; verify iOS/Android native builds in CI; address remaining auth lifecycle evidence; create integration PR against upstream/main.

## Autonomous engineer checkpoint (2026-11-05 integration)

- Starting base SHA: `ebf2b0f8b7ddfd6e89164b7823ca6cbcbf9a95df` (upstream/main = origin/main, verified after `git fetch origin`)
- Integration branch: `integration/full-cross-platform-completion` (from `ebf2b0f8b`, does not modify upstream/main)
- Preserved work: all 3 stashes retained (PostgreSQL port config, lockfile, WIP canonical-network-adapter); PR #480 work (capacity provisioning, PostgreSQL stores, macOS/Windows HTTP clients) already in `origin/main`; 3 iOS Swift compilation fixes after PR #480 also in `origin/main`.

- Completed this run:
  1. Verified latest upstream main = `ebf2b0f8b7ddfd6e89164b7823ca6cbcbf9a95df` (matches mission-referenced SHA).
  2. Created dedicated integration branch from verified upstream main; did not touch upstream/main.
  3. Fixed CRITICAL iOS defect: `clients/ios/App/IRPiOSApp.swift` hardcoded `http://127.0.0.1:3000`. Replaced with endpoint read from `Info.plist` (`IRPControlPlaneBaseURL`), validated at startup (HTTPS required in production; localhost allowed only in DEBUG), fail-closed with explicit "configuration required" error. Added `IRPControlPlaneClientError.configurationRequired`.
  4. Removed `http://127.0.0.1:3000` default parameter from `clients/ios/Sources/IRPiOSClient/HttpControlPlaneClient.swift`.

## Autonomous engineer checkpoint (2026-11-08)

- Starting base SHA: 4598ea75afcc5921fe2aaca3dd34e7cef0dad521 (upstream/main, post-PR #496 merge)
- Ending base SHA: (pending this PR)
- Completed this run: reconciled PROJECT_STATE.md with live main SHA 4598ea75 (Merge PR #496 Integration/full cross-platform completion). Confirmed phases 94–150 modules and docs present on main; status remains PARTIAL pending exact-SHA CI and external evidence. Updated open issues list to include #410, #463. No runtime authority changes. No code changes beyond state reconciliation.
- Branches/PRs: chore/reconcile-project-state-4598ea75 (this PR)
- Actual CI: pending
- Verified merges: PR #496 previously merged
- Blockers: exact-SHA CI evidence on phase tests; Linux runtime soak (#254/#323); full durable multi-instance API stores (#410); auth lifecycle (#412); CodeQL (#420); capacity provisioning evidence (#463).
- Next prioritized tasks: address #410 full API durable repositories with multi-instance tests; resolve CodeQL conflict; continue evidence for remaining phase gates; Linux soak when hardware available.
