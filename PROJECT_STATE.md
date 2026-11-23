# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Autonomous engineer checkpoint (2026-11-23 continuous) — CI package version aligned

- Starting base SHA: `bac51aea6afd8ada57d40c877cad81fb5cb9005e` (origin/main)
- Branch: `release/linux-enduser-ready` (HEAD after CI fix commits)
- Completed this run: Fixed Linux primary device CI by aligning expected Debian package version from 0.2.5 to 0.2.7 in both `.github/workflows/linux-primary-device.yml` and `.github/workflows/ci.yml` to match `scripts/build-linux-deb.sh` default. This unblocks the package build and acceptance steps for the Linux client path. Daemon packaging (`build-linux-daemon-deb.sh`), systemd unit (`User=irp`, `CAP_NET_ADMIN` only), fail-closed host-authorization, honest status surfaces, and PrivilegedMutationBoundary sole mutation path remain unchanged and correct. Operator docs accurate.
- Verified: workflows now expect `irp-linux-client_0.2.7_amd64.deb`; daemon path still honest.
- Remaining blockers (explicit): Linux runtime soak evidence (#323); Postgres production evidence (#410/#411); exact-SHA CI on the release gate (now expected to improve after this fix); DNS write policy under non-root (intentionally disabled); full production certification remains open.
- Honest status: **prerelease / developer-preview only**. Not production-certified. Operators can install on Debian 13, run observe-only safely, and (with explicit opt-in) apply bounded verified route changes that go through apply → verify → rollback. DNS switching is not available under the shipped `User=irp` unit.
- Next: monitor updated PR #537 checks; if further failures, fix root cause on same branch. Final approval remains with the repository owner.

## Autonomous engineer checkpoint (2026-11-23 07:11 +0330) — PR #537 checks in progress

- Starting base SHA: `bac51aea6afd8ada57d40c877cad81fb5cb9005e` (origin/main)
- Branch: `release/linux-enduser-ready` (HEAD at inspection `7b00a1f5525e03ba2324d0d266f4472a527dab55`)
- Completed this run: Inspected live state. Open PR #537 (https://github.com/NahiraDev/InternetResiliencePlatform/pull/537) for Linux end-user ready prerelease. Checks on head SHA are partially complete: Architecture contract SUCCESS, Dependency Review SUCCESS, Vercel deployments SUCCESS; many others (Linux primary device, network-namespace e2e, android, ios, windows, CodeQL analyzes) still in_progress. No merge performed (pending exact-SHA full success + reviews). Phases 94–150 remain implemented on main but PARTIAL pending exact-SHA CI evidence and external runtime verification. No code changes this inspection; ResilienceRuntime remains sole production mutation authority.
- Verified: live GitHub state of PROJECT_STATE.md, ACTIVE_WORK.md, open issues (#272, #323, #410, #411, #463), PR #537 status, phase-150.md.
- Remaining blockers (explicit): Linux runtime soak evidence (#323); Postgres production evidence (#410/#411); exact-SHA CI on the release gate and this PR; DNS write policy under non-root (intentionally disabled); full production certification remains open. External dependencies prevent closing production gates.
- Honest status: **prerelease / developer-preview only**. Not production-certified. Operators can install on Debian 13, run observe-only safely, and (with explicit opt-in) apply bounded verified route changes that go through apply → verify → rollback. DNS switching is not available under the shipped `User=irp` unit. Phase 150 certification verdict remains PARTIAL.
- Next: monitor PR #537 checks to completion; if failures, fix root cause on same branch and re-push; obtain external evidence for #323/#410/#411 where possible; continue exact-SHA evidence collection. Do not declare Phase 150 complete without full evidence.

## Autonomous engineer checkpoint (2026-11-23 continuous) — Linux end-user ready prerelease prepared

- Starting base SHA: `bac51aea6afd8ada57d40c877cad81fb5cb9005e` (origin/main)
- Branch: `release/linux-enduser-ready`
- Completed this run: Continued from previous reconciliation. Verified packaging scripts (`scripts/build-linux-daemon-deb.sh`, `scripts/install-linux.sh`) remain non-interactive and fail-closed. systemd unit (`infra/systemd/irp-daemon.service`) runs as `User=irp` with only `CAP_NET_ADMIN`. Host-authorization (`apps/daemon/src/host-authorization.ts`) is fail-closed: route.write requires live opt-in + CAP_NET_ADMIN + `ip`; dns.write requires euid=0 + resolvectl and is therefore never granted under the shipped unit. Status surfaces (`/v1/health`, `irp status`, `irp doctor`) are honest and report blockers. Operator docs and prerelease notes match reality. No control-plane changes. All live mutations continue to go exclusively through PrivilegedMutationBoundary.
- Verified: build-linux-daemon-deb.sh, install-linux.sh, irp-daemon.service, host-authorization.ts, control-server health reporting, linux-enduser-guide.md, linux-enduser-prerelease-notes.md.
- Remaining blockers (explicit): Linux runtime soak evidence (#323); Postgres production evidence (#410/#411); exact-SHA CI on the release gate; DNS write policy under non-root (intentionally disabled); full production certification remains open.
- Honest status: **prerelease / developer-preview only**. Not production-certified. Operators can install on Debian 13, run observe-only safely, and (with explicit opt-in) apply bounded verified route changes that go through apply → verify → rollback. DNS switching is not available under the shipped `User=irp` unit.
- Next: push branch and open Pull Request for owner approval.

## Autonomous engineer checkpoint (2026-11-23 continuous) — Linux end-user ready PR open
## Autonomous engineer checkpoint (2026-11-23 continuous) — Linux end-user ready (current main)

- Starting base SHA: `bac51aea6afd8ada57d40c877cad81fb5cb9005e` (origin/main, after merging #536)
- Branch: `release/linux-enduser-ready`
- Completed this run: Fast-forwarded branch to current main. Verified packaging scripts (`scripts/build-linux-daemon-deb.sh`, `scripts/install-linux.sh`) remain non-interactive and fail-closed. systemd unit (`infra/systemd/irp-daemon.service`) runs as `User=irp` with only `CAP_NET_ADMIN`. Host-authorization (`apps/daemon/src/host-authorization.ts`) is fail-closed: route.write requires live opt-in + CAP_NET_ADMIN + `ip`; dns.write requires euid=0 + resolvectl and is therefore never granted under the shipped unit. Status surfaces are honest. Operator docs (`docs/operations/linux-enduser-guide.md`) match reality. No control-plane changes. All live mutations continue to go exclusively through PrivilegedMutationBoundary.
- Verified: build-linux-daemon-deb.sh, install-linux.sh, irp-daemon.service, host-authorization.ts (daemon + linux-client), linux-enduser-guide.md, prerelease notes.
- Remaining blockers (explicit): Linux runtime soak evidence (#323); Postgres production evidence (#410/#411); exact-SHA CI on the release gate; DNS write policy under non-root (intentionally disabled); full production certification remains open.
- Honest status: **prerelease / developer-preview only**. Not production-certified. Operators can install on Debian 13, run observe-only safely, and (with explicit opt-in) apply bounded verified route changes that go through apply → verify → rollback. DNS switching is not available under the shipped `User=irp` unit.
- Next: push branch and open/update Pull Request for owner approval.

- Starting base SHA: `260c67915a7755d533c925a68cc1ce3e81a94298` (origin/main)
- Branch: `release/linux-enduser-ready` (HEAD `8c76d4f2`)
- Completed this run: Verified packaging scripts are non-interactive and fail-closed, systemd unit grants only CAP_NET_ADMIN to User=irp, host authorization is fail-closed for DNS write (requires euid=0 + resolvectl), status surfaces are honest, and operator docs match reality. No control-plane changes. Pull Request #535 is open for owner approval.
- Verified: build-linux-daemon-deb.sh, install-linux.sh, irp-daemon.service, host-authorization.ts (daemon + linux-client), linux-enduser-guide.md, prerelease notes.
- Remaining blockers (explicit): Linux runtime soak evidence (#323); Postgres production evidence (#410/#411); exact-SHA CI on the release gate; DNS write policy under non-root (intentionally disabled); full production certification remains open.
- Honest status: **prerelease / developer-preview only**. Not production-certified. Operators can install on Debian 13, run observe-only safely, and (with explicit opt-in) apply bounded verified route changes that go through apply → verify → rollback. DNS switching is not available under the shipped `User=irp` unit.
- Next: owner review and approval of PR #535; obtain Linux soak evidence; keep DNS write disabled or design a least-privilege alternative; continue exact-SHA evidence collection.

## Autonomous engineer checkpoint (2026-11-23) — Linux end-user ready (current branch)

- Starting base SHA: `260c67915a7755d533c925a68cc1ce3e81a94298` (origin/main)
- Branch: `release/linux-enduser-ready`
- Completed this run: Confirmed the Linux end-user path is coherent and honest on current main. Packaging (`scripts/build-linux-daemon-deb.sh`, `scripts/install-linux.sh`) is non-interactive and fail-closed. systemd unit runs as `User=irp` with only `CAP_NET_ADMIN`. Host-authorization is fail-closed (route.write requires live opt-in + CAP_NET_ADMIN + `ip`; dns.write requires root + `resolvectl` and is therefore never granted under the shipped unit). Status surfaces report live vs safe and list blockers. All mutations go exclusively through PrivilegedMutationBoundary. Operator docs (`docs/operations/linux-enduser-guide.md`, prerelease notes) are accurate. No control-plane changes.
- Verified: systemd unit, install/build scripts, host-authorization.ts, end-user guide, prerelease notes.
- Remaining blockers (explicit): Linux runtime soak evidence (#323); Postgres production evidence (#410/#411); exact-SHA CI on the release gate; DNS write policy under non-root (intentionally disabled); full production certification remains open.
- Honest status: **prerelease / developer-preview only**. Not production-certified. Operators can install on Debian 13, run observe-only safely, and (with explicit opt-in) apply bounded verified route changes that go through apply → verify → rollback. DNS switching is not available under the shipped `User=irp` unit.
- Next: open/update PR for owner approval; obtain Linux soak evidence; keep DNS write disabled or design a least-privilege alternative; continue exact-SHA evidence collection.

(Full historical checkpoints preserved below from prior reconciliations.)

- Starting base SHA: `432c89cadacc06e45e6d7aabfff230a28afee812` (origin/main, post-merge of #527)
- Branch: `release/linux-enduser-ready` (PR #528, merged)
- Completed this run: Confirmed and documented the Linux end-user path. systemd units remain `User=irp` with only `CAP_NET_ADMIN`. Host-authorization is fail-closed (route mutation needs live opt-in + CAP_NET_ADMIN + `ip`; DNS write needs root + `resolvectl` and is therefore not granted under the service account). Added/confirmed `docs/operations/linux-enduser-guide.md` so an operator can install, start via systemd, read honest status, and understand limitations. Aligned package version default to 0.2.5. No changes to mutation authority. PrivilegedMutationBoundary remains the single mutation path.
- Verified: host-authorization source + tests; systemd unit contracts; DNS status under User=irp correctly disabled and documented in PROJECT_STATE, CHANGELOG, README, and the end-user guide.
- Remaining blockers (explicit): Linux runtime soak evidence (#323); Postgres production evidence (#410/#411); exact-SHA CI on the release gate; DNS write policy under non-root (intentionally disabled); full production certification remains open.
- Honest status: **prerelease / developer-preview only**. Not production-certified. Operators can install on Debian 13, run observe-only safely, and (with explicit opt-in) apply bounded verified route changes. DNS switching is not available under the shipped `User=irp` unit.
- Next: land PR #528; obtain Linux soak evidence; keep DNS write disabled or design a least-privilege alternative; continue exact-SHA evidence collection.

- Linux end-user packaging, systemd unit, and docs are coherent on main. This branch reconciles state for owner review of the prerelease.
- **Prerelease / developer-preview only — not production-certified.**

See full history in prior commits on this branch and main.
