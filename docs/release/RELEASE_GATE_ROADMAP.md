# IRP Release Gate Roadmap

> Single ordered path from the current `main` to a certified IRP v1.0 release, then into the post-v1 roadmap. This document sequences work that already exists in [`PROJECT_STATE.md`](../../PROJECT_STATE.md), [`ROADMAP.md`](../../ROADMAP.md), [`MASTER_ROADMAP_V2.md`](../roadmap/MASTER_ROADMAP_V2.md), issue #272 (epic), #284 (deployment workstream) and #323 (final external validation gate). It does not introduce a new architecture, phase or authority.

## Baseline reviewed

- Commit reviewed: `51979d36bc3cf1de302d4cb166685d2475d79950` (`main`, merge of PR #325), reviewed 2026-10-07.
- Local gates re-run on this commit with Node 24 and pnpm 11.21.0: `pnpm validate`, `typecheck`, `lint`, `test`, `validate:docs`, `architecture:check`, `architecture:guards`, `audit:deep`, `examples:smoke`, `phase69:readiness`, `phase70:certify`, `production:assure`, `full-system:matrix`, `integration:graph`, `runtime:integration:strict` all pass.
- Remote CI on that historical 2026-10-07 baseline: CI, System Assurance, Linux Primary Device, Runtime Lab, Repository Deep Audit, Android, Windows, macOS and iOS Network Integration passed. **iOS Full Client and Public Runtime Lab failed**, which made `Release Gate` fail. The statement that no GitHub Release existed applies only to that historical date; developer-preview/prereleases `v0.2.0` and `v0.2.1` were published later. Neither is production certification.

## Release blockers recorded in the historical 2026-10-07 change

| #   | Blocker                                                                                                                                                                                                                         | Fix                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `pnpm integration:baseline` failed: the API and daemon runtime reports never recorded workspace integrations, so six required `@irp/daemon` edges were reported as "not exercised".                                             | `tools/runtime-lab/package-e2e.mjs` now proves each workspace dependency of a running application loads, without starting a second application copy. |
| 2   | iOS Full Client: `xcodebuild` segfaulted (exit 139) on every run since the workflow was made mandatory. The job pinned a concrete simulator (`iPhone 16, OS=18.4`) that is not installed on the runner (18.5, 18.6, 26.x only). | Build against `generic/platform=iOS Simulator`, which needs no simulator runtime. **Must be confirmed by a macOS CI run** (see Step 2).              |
| 3   | Public Runtime Lab: the 5-hour soak failed on the first `/ready` poll through a Cloudflare Quick Tunnel, which has no uptime guarantee.                                                                                         | Soak probes retry transport errors a bounded number of times; persistent failures and non-200 statuses still fail the job.                           |
| 4   | The release workflow had been deleted, so Phase 71 evidence could not be produced. `docs/downloads.md` also named a non-existent Android asset.                                                                                 | Restored `release.yml` with a fail-closed `gate` job that requires a green Release Gate for the tagged commit. Download docs now match the contract. |
| 5   | `@fastify/static` 10.1.1 (production dependency of the API through Swagger UI) had a moderate authorization-bypass advisory.                                                                                                    | Override raised to 10.1.5; `pnpm audit --prod` is clean.                                                                                             |

## Known remaining items (not changed here)

- Historical advisory snapshot (2026-10-07; must be re-audited against the current lockfile): `vitest` 3.2.7 and `tinypool` were reported by `pnpm audit` with two critical and two moderate advisories. A prior trial of vitest 4.1.11 broke `@irp/failover` type resolution; it requires an isolated dependency change and full verification. The recorded `package.json` ranges (`vitest ^4.1.11`, `@vitest/coverage-v8 5.0.2`) were inconsistent with the 3.2.7 override.
- `Release Gate` is event-driven, not a 90-minute polling loop. Each completed prerequisite workflow triggers an exact-SHA snapshot evaluation; an early evaluation can fail because a required workflow has not completed, and the next completion triggers another evaluation. A passing result is authoritative only for the exact SHA evaluated. Current repair-branch CI has not yet been verified.
- `pnpm diagnostics:strict` exits non-zero without a live runtime URL. That is expected locally and is covered by Runtime Lab in CI.

## Roadmap

### Step 1 — Land the fixes (hours)

1. Merge this change through a pull request; wait for CI, Repository Deep Audit and System Assurance to pass.
2. Exit criterion: every required workflow passes on the exact PR SHA. No required platform or soak workflow may be excluded, waived, or made non-blocking to obtain a green gate.

### Step 2 — Turn iOS Full Client green (hours to 1 day)

1. Confirm the generic-simulator build passes on `macos-15`.
2. If `xcodebuild` still crashes, in this order: normalize every object ID in `project.pbxproj` to 24 hexadecimal characters (current IDs use letters outside A-F, such as `G`, `K`, `P`, `R`) and update the scheme and the contract checks in `ios-client.yml` and `ios-network-integration.yml`; add `NetworkExtensionAdapter.swift` to the project if the app target needs it; regenerate the project with XcodeGen as the last resort.
3. Exit criterion: iOS Full Client green with the full build mandatory. Do not reintroduce `|| true` or skip the build.

### Step 3 — Green Release Gate on one `main` SHA (about 6 hours of wall clock)

1. Let all 12 required workflows finish on the merge commit, including the Public Runtime Lab soak.
2. Exit criterion: `Release Gate` completes with success on the current `main` SHA. This closes the "remote CI green" item in #323.

### Step 4 — Linux runtime and soak evidence (#254, #323)

1. Run the Linux Primary Device lane on a runner large enough to avoid memory-pressure SIGKILL; attach the run link.
2. Capture the closed-loop soak evidence: observation → decision → mutation → destination outcome → verification → recovery/commit, using `docs/release/debian-device-acceptance.md`.
3. Capture deployment evidence: package install, startup, readiness, shutdown on the target Linux environment.
4. Exit criterion: evidence attached to #323 and referenced from `docs/release/production-certification.md`.

### Step 5 — Phase 71 certification (day 2)

1. Existing `v0.2.0` and `v0.2.1` are developer-preview/prereleases, not production-certified releases. Do not create or promote a stable tag from this repair alone. A future release candidate must use a newly verified commit and pass the Release Gate and `scripts/phase71-release.mjs`; generated checksums and every published platform asset must be inspected before any production-release claim.
2. Inspect every published asset: exactly one Android debug APK, Linux bundle, macOS bundle, Windows bundle and iOS source ZIP; no `.ipa`; names versioned; all non-empty; all covered by `SHA256SUMS.txt`.
3. Record the release URL and inspection result in `docs/phases/phase-71.md`, then update `PROJECT_STATE.md`.
4. Exit criterion: Phase 71's release/distribution contract is recorded with its actual asset and checksum evidence. A developer-preview/prerelease label is not equivalent to production certification; production claims additionally require Step 6.

### Step 6 — Production certification inputs (Phase 70 / Gate D)

The following stay `PENDING` by design until real evidence is supplied; none can be satisfied by source or simulation:

- `production:certify` evidence bundle and live runtime probe.
- Android device smoke test and signed release engineering (Android release signing; iOS signing is out of scope for v1 per Phase 71).
- Regional validation evidence from independent vantage points (`docs/regional-validation.md`).
- Security audit sign-off and upgrade/rollback and backup/restore rehearsals on a staging deployment.

Exit criterion: `pnpm production:certify` reports certified with the evidence bundle attached; issues #254, #284, #323 and #272 closed in that order.

### Step 7 — Post-v1 execution (Phases 72-150)

Architecture work in Phases 72–150 follows `PROJECT_STATE.md` and the dependency rules in `MASTER_ROADMAP_V2.md`; it does not need to wait for production certification. Each phase requires an explicit contract/authorization where specified, one owner, and a branch `phase/<number>-<short-name>`. Extend the canonical owner (`@irp/resilience-runtime`) rather than creating a second control plane. Stable-release and production-certification claims remain blocked until all release and external-evidence gates pass.

| Order | Groups                                                                     | Phases  | Gate to start                                          |
| ----- | -------------------------------------------------------------------------- | ------- | ------------------------------------------------------ |
| 1     | Unified Control Plane (A)                                                  | 72-78   | Implemented; close remaining evidence via Steps 3-6    |
| 2     | Intent & Policy (B)                                                        | 79-85   | Group A evidence complete                              |
| 3     | Connectivity Fabric (C), Advanced Routing & Recovery (D)                   | 86-99   | Intent & policy contracts stable                       |
| 4     | Telemetry & Network Intelligence (E), Security & Trust (F)                 | 100-113 | Safety, rollback and authorization in place            |
| 5     | Fleet & Distributed Control (G), Intelligence, Simulation & Production (H) | 114-127 | Device/control contracts reused, local fallback proven |
| 6     | Data Plane & Traffic Engineering (I), Platform APIs & Extensibility (J)    | 128-140 | Explicit policy and safety control on enforcement      |
| 7     | Privacy, Governance & Compliance (K), Reliability, Scale & DR (L)          | 141-150 | All prior guarantees preserved                         |

Each phase needs: scope, non-goals, dependencies, contracts, tests, acceptance criteria, rollback notes, and green CI before it is called complete.

## Definition of released

IRP is released only when: Release Gate is green on the release SHA, a real tagged GitHub Release exists with inspected assets and verified checksums, Phase 71 evidence is recorded, and the evidence items in Step 6 are attached. Source presence, local tests and architecture checks alone are not release evidence.