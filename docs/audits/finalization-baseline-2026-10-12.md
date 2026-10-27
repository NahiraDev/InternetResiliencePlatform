# Finalization Baseline and Execution Report — 2026-10-12

**Purpose:** authoritative record of the repository state at the start of the 2026-10-12 finalization mission, the work executed, and the blockers found. It complements [`../../PROJECT_STATE.md`](../../PROJECT_STATE.md) and does not replace it.

## Repository identity

| Item                  | Value                                                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Repository            | `nimarahimloo/InternetResiliencePlatform` (public)                                                                                       |
| Relationship          | Fork of `NahiraDev/InternetResiliencePlatform`; `main` was identical to `upstream/main` at baseline (0 ahead / 0 behind)                 |
| Push target           | `origin` = the fork (admin permission); nothing is pushed to the upstream repository                                                     |
| Default branch        | `main` (no branch protection configured)                                                                                                 |
| Baseline SHA          | `bf73303df0c5dbafb37b6724baa1556852585b1b` — `fix(release): restrict Docker publication to CI-gated SHA previews` (2026-10-11T07:37:32Z) |
| Baseline timestamp    | 2026-10-12T09:34:19Z                                                                                                                     |
| Working tree at clone | clean; no stashes; no local-only commits                                                                                                 |

## Remote state at baseline

- **Branches/PRs:** no branch or PR newer than `bf73303`; last merged PR [#9](https://github.com/nimarahimloo/InternetResiliencePlatform/pull/9) (2026-10-09). There was no WP2.2 commit, branch or PR anywhere on GitHub, so earlier claims that WP2.2 checks 2–4 were "completed and released" could not be verified and were re-executed from scratch.
- **Issues (fork):** [#4](https://github.com/nimarahimloo/InternetResiliencePlatform/issues/4) — post-v0.2.1 follow-up (runtime validation, signing, production certification). Program tracking issues #254, #272–#284 and #323 live in the upstream repository.
- **Tags/releases:** `v0.2.0`, `v0.2.1`, both GitHub **prereleases**. No stable release exists.
- **Workflows at `bf73303`:** Release Gate and Docker Publish succeeded on 2026-10-11 (run [38141959907](https://github.com/nimarahimloo/InternetResiliencePlatform/actions/runs/38141959907)); today's scheduled Repository Deep Audit succeeded; today's `workflow_run` Release Gate / Docker Publish runs were **skipped** (no new push).
- **Dependency Review** had failed on every PR since the fork was created because the dependency graph was disabled. Fixed by enabling vulnerability alerts (repository setting); it now passes.

## Canonical sources read

- [`PROJECT_STATE.md`](../../PROJECT_STATE.md) — Phase 78 is the implemented control-plane baseline; Phases 79–150 are reference-only and must not be started without explicit authorization.
- [`docs/architecture/product-roadmap-70-phases.md`](../architecture/product-roadmap-70-phases.md) — historical v1 contract, Phases 0–70.
- [`docs/roadmap/MASTER_ROADMAP_V2.md`](../roadmap/MASTER_ROADMAP_V2.md) — Phases 72–150 (titles only, no acceptance criteria).
- [`docs/audits/phase-history-evidence-matrix.md`](phase-history-evidence-matrix.md), [`docs/release/RELEASE_GATE_ROADMAP.md`](../release/RELEASE_GATE_ROADMAP.md), [`ops/release/production-certification.json`](../../ops/release/production-certification.json), `.github/workflows/release.yml`, `.github/workflows/release-gate.yml`.

## Baseline gate results (local, Node 24.21.0, pnpm 11.21.0)

All of `pnpm validate`, `turbo run typecheck|lint|build|test --force`, `architecture:check|guards|test`, `certification:test`, `bundle:test` and `validate:docs` passed at `bf73303`: 141 test files passed (+1 skipped), 1175 tests passed (+2 skipped). Running the gates rewrites tracked files under `artifacts/archaeology/` and `artifacts/production-certification/`; those generated changes were discarded and are not part of any commit.

## Work executed

| Package                                            | Commits                   | Result                                                                                     |
| -------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| TypeScript 6 Node types (WP2.2 check 1 root cause) | `11ba282`                 | 17 tsconfigs declare `types: ["node"]`                                                     |
| WP2.2a — Vitest 4.1.11 remediation                 | `e0f905b`                 | GHSA-82fw-gwwq-j7x9, GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr resolved; `pnpm audit` clean |
| WP2.2b — production-only runtime image             | `3fd570c`                 | fresh `--prod --offline` closure, no runtime install, direct Prisma CLI, smoke assertions  |
| Database outage crash (found by CI on PR #10)      | `72ea75f`                 | pool `error` listeners; API survives PostgreSQL stop/start                                 |
| Evidence and reports                               | this documentation commit | this report, WP2.2 report, phase matrix, remaining-work register, CI/release-gate matrix   |

Details: [`../security/wp2.2-remediation-report.md`](../security/wp2.2-remediation-report.md), [`../security/dependency-disposition-2026-10-12.md`](../security/dependency-disposition-2026-10-12.md), [`phase-1-150-status-matrix.md`](phase-1-150-status-matrix.md), [`remaining-work-register-2026-10-12.md`](remaining-work-register-2026-10-12.md), [`../release/ci-release-gate-matrix-2026-10-12.md`](../release/ci-release-gate-matrix-2026-10-12.md).

## Blockers identified

1. **Stable (non-prerelease) release is blocked by repository policy.** `release.yml` publishes with `--prerelease` until "the production certification matrix passes". `node scripts/production-certification.mjs` reports `PRODUCTION CERTIFICATION: PENDING`: no independently supplied evidence bundle and no live runtime probe. 15 evidence items are required (`ops/release/production-certification.json`), including `security-audit`, `regional-evidence`, `chaos-soak`, `backup-restore`, `upgrade-rollback`, `ios-device-smoke`, `android-device-smoke`, `accessibility` and `localization`. These need real devices, regional vantage points, signing credentials and human sign-off that cannot be produced from CI or this environment.
2. **Platform artifacts are not production deliverables.** v0.2.1 ships a debug Android APK, iOS source only (no signing/provisioning), and macOS/Windows archives that contain only `dist/index.js` plus a service manifest (2–3 KB, unsigned). There are no signing credentials in the repository or CI secrets.
3. **Phases 79–150 have no acceptance contracts** and are governed as reference-only by `PROJECT_STATE.md`. They cannot be "completed" without first defining and authorizing each phase contract.
4. **No Docker daemon in the authoring environment.** Image build, smoke and digest checks are taken from GitHub Actions runs; local runtime checks used an equivalent production tree.

---

# Baseline entry — 2026-10-13 (finalization continuation)

**Local HEAD:** `103752f` (pushed to `origin/main`). **Dirty tree before this entry:** clean. **Purpose:** record the follow-up work completed after the 2026-10-12 baseline and PR #19 merge, plus corrections to earlier claims.

## Work executed since the 2026-10-12 baseline

| Item | Commit(s) | Result |
| --- | --- | --- |
| Issue #11 — daemon closed-loop integration | PR #19 merge `a4c901a`, tests strengthened in `103752f` | `BoundedClosedLoopController` wired into `apps/daemon/src/index.ts` entrypoint with validated `IRP_LOOP_*` env config; 8 deterministic tests pass |
| Issue #15 — fail-closed image scan | PR #19 merge `a4c901a`, version fixed in `103752f` | Trivy scan by immutable digest added to `docker-publish.yml` (after push, before Cosign); fabricated `setup-trivy@v0.32.0` corrected to `v0.3.1` (verified against GitHub releases); blanket `--ignore-unfixed` removed |
| Issue #16 — drop pnpm from runtime image | PR #19 merge `a4c901a` | `/pnpm` copy, writable-path, compose tmpfs, and smoke assertion removed; smoke asserts pnpm is absent |
| Issue #17 — regional-validation workflow | PR #19 merge `a4c901a` | `.github/workflows/regional-validation.yml` added targeting `[self-hosted, linux, iran]`; never falls back to `ubuntu-latest` |
| Issue #18 — artifact determinism (root cause) | `7f52eee`, `103752f` | Replaced wall-clock/HEAD-SHA `generatedAt`/`registeredAt` with a content-derived SHA-256 fingerprint (sorted tracked file list + per-file blob SHA, excluding `artifacts/`); certification report split into deterministic canonical `certification-report.json` (tracked) and run-specific `certification-run.json` (untracked); verified a fresh worktree of `103752f` stays clean after install + build + archaeology + certification |

## Corrections to earlier claims

1. The earlier issue #11 close comment cited tests that included a tautological assertion (`|| true`) and an abort test accepting every status. Both were replaced with deterministic assertions in `103752f`; see the corrective comment on issue #11. All 22 daemon tests now pass with exact expected outcomes.
2. The earlier `setup-trivy@v0.32.0` reference in `docker-publish.yml` was a fabricated version. The action only publishes `v0.3.0`/`v0.3.1`; corrected in `103752f`.

## CI status at time of writing

Push workflows for `103752f` (CI, System Assurance, Runtime Lab, Public Runtime Lab, Linux Primary Device, CodeQL Advanced, Repository Deep Audit, Android/iOS/macOS/Windows clients) were launched at `21:42:43Z` and were still in flight when this entry was written. Earlier Release Gate runs on the merge commit `a4c901a` failed while `public-runtime-lab.yml` was still running; that workflow re-evaluates on each prerequisite completion and is expected to succeed once all push workflows complete on `103752f`.

## New deliverables

- `docs/audits/certification-evidence-register-2026-10-13.md` — per-item analysis of the 15 required certification evidence ids with obtainability classification and next executable actions.

## Remaining blockers (unchanged in substance)

1. Stable release remains blocked by repository policy: production certification is `PENDING` on all 15 required evidence items (see the new register for the per-item breakdown).
2. Platform artifacts remain debug/source-only; no production signing.
3. No self-hosted `[self-hosted, linux, iran]` runner is registered, so `regional-evidence` cannot be produced.
4. No Docker daemon locally; image evidence must come from the `docker-publish.yml` run on the final SHA.
