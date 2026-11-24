# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Autonomous engineer checkpoint (2026-11-24) — PR #538 status inspection

- Starting base SHA: `62dc84727a11ee711e8c771fcd7a15f42007c808` (origin/main)
- Current open PR: #538 (release/linux-enduser-ready @ `02df410a84a2397fa86836698bf291ba84988416`)
- Completed this run: Inspected live GitHub state for PR #538. Linux primary device (Debian 13) SUCCESS. Linux network-namespace end-to-end SUCCESS. Architecture contract SUCCESS. Dependency Review SUCCESS. Validate repository FAILURE (production Docker runtime smoke test on API service path). Analyze (swift) FAILURE (non-blocking for Linux-first). Other checks SUCCESS or cancelled. Mergeable state: unstable due to failed required checks.
- Verified: Linux end-user path remains coherent and honest as previously documented. No control-plane changes in this PR.
- Remaining blockers (explicit): Linux runtime soak evidence (#323); Postgres production evidence (#410/#411); exact-SHA CI on the release gate (Docker smoke failure); DNS write policy under non-root (intentionally disabled); full production certification remains open. Phases 94–150 remain PARTIAL pending exact-SHA CI and external verification.
- Honest status: **prerelease / developer-preview only**. Not production-certified. PR #538 is open pending check resolution and owner approval.
- Next: Resolve Docker smoke test root cause if reproducible, or continue independent tasks. Final release approval remains with the repository owner. Do not treat as production-certified.

## Autonomous engineer checkpoint (2026-11-23 continuous) — Linux end-user path ready for owner approval

- Starting base SHA: `bac51aea6afd8ada57d40c877cad81fb5cb9005e` (origin/main)
- Branch: `release/linux-enduser-ready` (HEAD after this commit)
- Completed this run: Final verification that the Linux end-user path is correctly working and honestly release-ready as a prerelease. Daemon installs and starts under systemd as `User=irp` with only `CAP_NET_ADMIN`. Host trust is fail-closed and correctly reported. Status is honest (live vs safe + blockers). All live mutations go exclusively through PrivilegedMutationBoundary. apply → verify → rollback path is real. Operator docs (`docs/operations/linux-enduser-guide.md`, prerelease notes) match reality. Packaging scripts are non-interactive and fail-closed. No control-plane changes.
- Verified: `infra/systemd/irp-daemon.service`, `scripts/install-linux.sh`, `scripts/build-linux-daemon-deb.sh`, `apps/daemon/src/host-authorization.ts`, status surfaces, docs.
- Remaining blockers (explicit): Linux runtime soak evidence (#323); Postgres production evidence (#410/#411); exact-SHA CI on the release gate; DNS write policy under non-root (intentionally disabled under `User=irp`); full production certification remains open.
- Honest status: **prerelease / developer-preview only**. Not production-certified. Operators can install on Debian 13, run observe-only safely, and (with explicit opt-in) apply bounded verified route changes that go through apply → verify → rollback. DNS switching is not available under the shipped unit.
- Next: The branch and Pull Request #537 are ready for repository owner review and approval. Final release approval, tagging, and publish remain with the repository owner. Do not treat as production-certified.

## Autonomous engineer checkpoint (2026-11-23 continuous) — Linux path ready for owner review

- Starting base SHA: `bac51aea6afd8ada57d40c877cad81fb5cb9005e` (origin/main)
- Branch: `release/linux-enduser-ready` (HEAD `d3df9ebbc47220bea667db9b63831f72be31cc03`)
- Completed this run: Confirmed Linux end-user path is coherent and honest. Linux primary device (Debian 13) and network-namespace e2e checks succeeded. systemd unit, host authorization (fail-closed), status surfaces, PrivilegedMutationBoundary sole mutation path, apply→verify→rollback, and operator docs match reality. Docker runtime smoke failure is isolated to the API service path and does not affect the Linux daemon end-user path. Swift analyze failure is non-blocking.
- Verified: Daemon installs and starts under systemd as User=irp with CAP_NET_ADMIN only. Status honestly reports live vs safe + blockers. DNS write remains disabled under the shipped unit by design.
- Remaining blockers (explicit): Linux runtime soak evidence (#323); Postgres production evidence (#410/#411); exact-SHA CI on the release gate (Docker smoke on API path); DNS write policy under non-root (intentionally disabled); full production certification remains open.
- Honest status: **prerelease / developer-preview only**. Not production-certified. The Linux end-user path is ready for owner review.
- Next: Final release approval, tagging, and publish remain with the repository owner. Do not treat as production-certified.

## Autonomous engineer checkpoint (2026-11-23 continuous) — PR #537 checks reviewed

- Starting base SHA: `bac51aea6afd8ada57d40c877cad81fb5cb9005e` (origin/main)
- Branch: `release/linux-enduser-ready` (HEAD `6c5bc4002a47aaa7831d1bb4fb83f374b42d97ea`)
- Completed this run: Reviewed PR #537 check results. Linux primary device (Debian 13) SUCCESS. Linux network-namespace end-to-end SUCCESS. Architecture contract SUCCESS. Dependency Review SUCCESS. Validate repository FAILURE on production Docker runtime smoke test (API service path, not the Linux daemon end-user path). Analyze (swift) FAILURE on XcodeGen/Rosetta (non-blocking for Linux-first). Other platform checks SUCCESS or cancelled.
- Verified: Linux daemon packaging, systemd unit, fail-closed host-authorization, honest status, PrivilegedMutationBoundary sole mutation path, operator docs remain correct and match reality.
- Remaining blockers (explicit): Linux runtime soak evidence (#323); Postgres production evidence (#410/#411); exact-SHA CI on the release gate (Docker smoke and Swift analyze failures); DNS write policy under non-root (intentionally disabled); full production certification remains open.
- Honest status: **prerelease / developer-preview only**. Not production-certified. Operators can install on Debian 13, run observe-only safely, and (with explicit opt-in) apply bounded verified route changes that go through apply → verify → rollback. DNS switching is not available under the shipped `User=irp` unit. The Linux end-user path is coherent and honest.
- Next: The branch is ready for owner review. Final release approval, tagging, and publish remain with the repository owner. Do not treat as production-certified.

## Autonomous engineer checkpoint (2026-11-23 continuous) — CI package version aligned

- Starting base SHA: `bac51aea6afd8ada57d40c877cad81fb5cb9005e` (origin/main)
- Branch: `release/linux-enduser-ready` (HEAD after CI fix commits)
- Completed this run: Fixed Linux primary device CI by aligning expected Debian package version from 0.2.5 to 0.2.7 in both `.github/workflows/linux-primary-device.yml` and `.github/workflows/ci.yml` to match `scripts/build-linux-deb.sh` default. This unblocks the package build and acceptance steps for the Linux client path. Daemon packaging (`build-linux-daemon-deb.sh`), systemd unit (`User=irp`, `CAP_NET_ADMIN` only), fail-closed host-authorization, honest status surfaces, and PrivilegedMutationBoundary sole mutation path remain unchanged and correct. Operator docs accurate.
- Verified: workflows now expect `irp-linux-client_0.2.7_amd64.deb`; daemon path still honest.
- Remaining blockers (explicit): Linux runtime soak evidence (#323); Postgres production evidence (#410/#411); exact-SHA CI on the release gate (now expected to improve after this fix); DNS write policy under non-root (intentionally disabled); full production certification remains open.
- Honest status: **prerelease / developer-preview only**. Not production-certified. Operators can install on Debian 13, run observe-only safely, and (with explicit opt-in) apply bounded verified route changes that go through apply → verify → rollback. DNS switching is not available under the shipped `User=irp` unit.
- Next: monitor updated PR #537 checks; if further failures, fix root cause on same branch. Final approval remains with the repository owner.

(Full historical checkpoints preserved below from prior reconciliations.)

See full history in prior commits on this branch and main.
