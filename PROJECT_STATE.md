# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Autonomous engineer checkpoint (2026-11-24 current) — Linux end-user path re-confirmed ready for owner approval (PR #538)

- Starting base SHA: `e45c43b790ba455b70f2cf21bb02fe5d1c9d8a93` (HEAD of release/linux-enduser-ready)
- Branch: `release/linux-enduser-ready`
- Completed this run: Fresh independent verification against live branch tip. Confirmed the Linux-first prerelease remains correctly working and honestly documented:
  - `infra/systemd/irp-daemon.service`: User=irp, Group=irp, CapabilityBoundingSet=CAP_NET_ADMIN, AmbientCapabilities=CAP_NET_ADMIN, NoNewPrivileges, ProtectSystem=strict.
  - `scripts/install-linux.sh`: non-interactive (CI=true), fail-closed if dist/ missing, creates irp user, installs unit.
  - `apps/daemon/src/host-authorization.ts`: fail-closed authorizeHost — live route only if Linux + CapEff CAP_NET_ADMIN + ip + both opt-ins; DNS write only if additionally euid===0 + resolvectl (never under shipped User=irp).
  - `packages/resilience-runtime/src/transactions/privileged-boundary.ts`: sole mutation path, full prepare→snapshot→validate→policy→security→safety→apply→verify→commit; failure → rollback→verifyRollback→recover. No second control plane.
  - Status surfaces include explicit releaseStatus marker. Operator docs and prerelease notes match code exactly.
- Remaining blockers (explicit, not hidden): Linux runtime soak evidence (#323); Postgres production evidence (#410/#411); exact-SHA CI on the release gate; DNS write under non-root User=irp (intentionally disabled by design); full production certification remains open.
- Honest status: **prerelease / developer-preview only**. Not production-certified. Operators can install on Debian 13, observe safely, and (with explicit opt-in) apply bounded verified route changes that go through apply → verify → rollback. DNS switching is not available under the shipped unit.
- Next: Branch is pushed. Pull Request #538 is open into main for repository owner review and approval. Final release approval, tagging, and publish remain with the repository owner. Do not treat as production-certified.

## Autonomous engineer checkpoint (2026-11-23) — Linux end-user path hardened with explicit prerelease marker in status

- Branch: `release/linux-enduser-ready`
- Completed this run: Added explicit `releaseStatus: 'prerelease / developer-preview (not production-certified)'` field to the daemon `health()` response so `irp status` and operator surfaces cannot be misread as production-ready. Surfaced the same field in the CLI assessment summary. Re-verified:
  - systemd unit runs as User=irp with CAP_NET_ADMIN only (Ambient + Bounding).
  - Host authorization remains fail-closed (live route requires Linux + CapEff CAP_NET_ADMIN + ip + both opt-ins; DNS write requires euid===0 and is blocked under the shipped unit).
  - All live mutations still exclusive to PrivilegedMutationBoundary (prepare→…→apply→verify→commit; rollback path real).
  - Install scripts non-interactive and fail-closed on missing dist.
  - Operator docs and prerelease notes remain accurate.
- Remaining blockers (explicit): Linux runtime soak evidence (#323); Postgres production evidence (#410/#411); exact-SHA CI on the release gate; DNS write under non-root User=irp (by design); full production certification open.
- Honest status: **prerelease / developer-preview only**. Not production-certified. Ready for owner review of the Linux end-user path.

## Autonomous engineer checkpoint (2026-11-24 independent) — Linux end-user path re-verified; PR #538 ready for owner approval

- Starting base SHA: `eabecdf143003228b5ddd49153864b5c8e69313a` (HEAD of release/linux-enduser-ready)
- Branch: `release/linux-enduser-ready`
- Completed this run: Independent re-verification of the Linux-first prerelease path against current code and docs. Confirmed:
  - `scripts/install-linux.sh` and `scripts/build-linux-daemon-deb.sh` are non-interactive (`CI=true`) and fail-closed if dist artifacts are missing.
  - systemd unit (`infra/systemd/irp-daemon.service`) runs as `User=irp` / `Group=irp` with `CapabilityBoundingSet=CAP_NET_ADMIN` and `AmbientCapabilities=CAP_NET_ADMIN` only; NoNewPrivileges, ProtectSystem=strict, etc.
  - Host authorization (`apps/daemon/src/host-authorization.ts` `authorizeHost`) is fail-closed: live route requires Linux + CAP_NET_ADMIN (from CapEff) + `ip` on PATH + explicit opt-in (`IRP_RUNTIME_MODE=live` + `IRP_ENABLE_LIVE_ROUTE_MUTATION=true`); DNS write additionally requires `euid === 0` + `resolvectl` and is never granted under the shipped non-root unit (blocker is reported).
  - Status surfaces honestly report live vs safe mode + explicit blockers.
  - All live mutations go exclusively through `PrivilegedMutationBoundary` (`packages/resilience-runtime/src/transactions/privileged-boundary.ts`): full phase machine prepare → snapshot → validate → policy → security → safety → apply → verify → commit; failure path rollback → verifyRollback → recover. No second control plane.
  - apply → verify → rollback path is real for bounded route changes when opted in and host facts allow.
  - Operator docs (`docs/operations/linux-enduser-guide.md`) and `docs/release/linux-enduser-prerelease-notes.md` match the code. Release is explicitly marked prerelease / developer-preview.
- Remaining blockers (explicit, not hidden): Linux runtime soak evidence (#323); Postgres production evidence (#410/#411); exact-SHA CI on the release gate; DNS write under non-root User=irp (intentionally disabled by design); full production certification remains open.
- Honest status: **prerelease / developer-preview only**. Not production-certified. Operators can install on Debian 13, observe safely, and (with explicit opt-in) apply bounded verified route changes that go through apply → verify → rollback. DNS switching is not available under the shipped unit.
- Next: Branch is pushed. Pull Request #538 is open into main for repository owner review and approval. Final release approval, tagging, and publish remain with the repository owner. Do not treat as production-certified.

## Autonomous engineer checkpoint (2026-11-24 continuous) — Linux end-user path confirmed ready; PR #538 open for owner approval

- Starting base SHA: `b6d43c07c3f0b0f37ff904d35e9ffc8ea25dfe87` (HEAD of release/linux-enduser-ready)
- Branch: `release/linux-enduser-ready`
- Completed this run: Final independent verification of the Linux end-user path. Confirmed:
  - Daemon installs via `scripts/install-linux.sh` / `scripts/build-linux-daemon-deb.sh` (non-interactive, fail-closed).
  - systemd unit runs as `User=irp` / `Group=irp` with only `CapabilityBoundingSet=CAP_NET_ADMIN` and `AmbientCapabilities=CAP_NET_ADMIN`.
  - Host authorization (`apps/daemon/src/host-authorization.ts`) is fail-closed: live route requires Linux + CAP_NET_ADMIN + `ip` + explicit opt-in (`IRP_RUNTIME_MODE=live` + `IRP_ENABLE_LIVE_ROUTE_MUTATION=true`); DNS write additionally requires euid=0 + resolvectl and is blocked under User=irp.
  - Status surfaces honestly report live vs safe mode + explicit blockers.
  - All live mutations go exclusively through `PrivilegedMutationBoundary` (full phase machine: prepare → snapshot → validate → policy → security → safety → apply → verify → commit; failure path: rollback → verifyRollback → recover). No second control plane.
  - apply → verify → rollback path is real for bounded route changes when opted in.
  - Operator docs (`docs/operations/linux-enduser-guide.md`) and prerelease notes match reality.
- Remaining blockers (explicit, not hidden): Linux runtime soak evidence (#323); Postgres production evidence (#410/#411); exact-SHA CI on the release gate; DNS write under non-root User=irp (intentionally disabled by design); full production certification remains open.
- Honest status: **prerelease / developer-preview only**. Not production-certified. Operators can install on Debian 13, observe safely, and (with explicit opt-in) apply bounded verified route changes that go through apply → verify → rollback. DNS switching is not available under the shipped unit.
- Next: Branch is pushed. Pull Request #538 is open into main for repository owner review and approval. Final release approval, tagging, and publish remain with the repository owner. Do not treat as production-certified.

## Autonomous engineer checkpoint (2026-11-23 continuous) — Linux end-user path verified ready for owner approval (PR #538)

- Starting base SHA: `4ffb461ac568facb5bac26eec5671daeabbf9c17` (HEAD of release/linux-enduser-ready, PR #538 open)
- Branch: `release/linux-enduser-ready`
- Completed this run: Continued from open PR #538. Performed additional verification of the Linux end-user path. Confirmed daemon install via `scripts/install-linux.sh` and `scripts/build-linux-daemon-deb.sh` (non-interactive, fail-closed). systemd unit (`User=irp`, only `CAP_NET_ADMIN`, NoNewPrivileges, ProtectSystem=strict). Host authorization in `apps/daemon/src/host-authorization.ts` is fail-closed: live route requires Linux + CAP_NET_ADMIN + `ip` + explicit opt-in; DNS write requires euid=0 + resolvectl and is blocked under User=irp. Status surfaces report honest live/safe + blockers. All mutations exclusively through PrivilegedMutationBoundary (prepare→...→apply→verify→commit; failure → rollback→verifyRollback→recover). Operator docs (`docs/operations/linux-enduser-guide.md`) and prerelease notes match reality. No second control plane. Release explicitly prerelease / developer-preview.
- Verified: packaging scripts, systemd unit, host-authorization.ts (full logic), PrivilegedMutationBoundary phases, docs, CHANGELOG, PROJECT_STATE.
- Remaining blockers (explicit, not hidden): Linux runtime soak evidence (#323); Postgres production evidence (#410/#411); exact-SHA CI on the release gate; DNS write under non-root User=irp (intentionally disabled by design); full production certification remains open.
- Honest status: **prerelease / developer-preview only**. Not production-certified. Operators can install on Debian 13, observe safely, and (with explicit opt-in) apply bounded verified route changes that go through apply → verify → rollback. DNS switching is not available under the shipped unit.
- Next: Branch is pushed, PR #538 is open for repository owner review and approval. Final release approval, tagging, and publish remain with the repository owner. Do not treat as production-certified.

## Autonomous engineer checkpoint (2026-11-23 continuous) — post-merge Linux end-user path ready for owner approval

- Starting base SHA: `62dc84727a11ee711e8c771fcd7a15f42007c808` (origin/main after PR #537 merge)
- Branch: `release/linux-enduser-ready` (HEAD after this commit)
- Completed this run: Continued from the merged PR #537. Reconciled documentation to the exact current SHA. Verified the Linux end-user path remains correctly working and honestly release-ready as a prerelease. Daemon installs and starts under systemd as `User=irp` with only `CAP_NET_ADMIN`. Host trust is fail-closed and correctly reported. Status is honest (live vs safe + blockers). All live mutations go exclusively through PrivilegedMutationBoundary. apply → verify → rollback path is real. Operator docs match reality. Packaging scripts are non-interactive and fail-closed. No control-plane changes.
- Verified: `infra/systemd/irp-daemon.service`, `scripts/install-linux.sh`, `scripts/build-linux-daemon-deb.sh`, `apps/daemon/src/host-authorization.ts`, status surfaces, docs.
- Remaining blockers (explicit): Linux runtime soak evidence (#323); Postgres production evidence (#410/#411); exact-SHA CI on the release gate; DNS write policy under non-root (intentionally disabled under `User=irp`); full production certification remains open.
- Honest status: **prerelease / developer-preview only**. Not production-certified. Operators can install on Debian 13, run observe-only safely, and (with explicit opt-in) apply bounded verified route changes that go through apply → verify → rollback. DNS switching is not available under the shipped unit.
- Next: The branch and Pull Request are ready for repository owner review and approval. Final release approval, tagging, and publish remain with the repository owner. Do not treat as production-certified.

## Autonomous engineer checkpoint (2026-11-23 continuous) — Linux end-user path ready for owner approval

- Starting base SHA: `bac51aea6afd8ada57d40c877cad81fb5cb9005e` (origin/main)
- Branch: `release/linux-enduser-ready` (HEAD after this commit)
- Completed this run: Final verification that the Linux end-user path is correctly working and honestly release-ready as a prerelease. Daemon installs and starts under systemd as `User=irp` with only `CAP_NET_ADMIN`. Host trust is fail-closed and correctly reported. Status is honest (live vs safe + blockers). All live mutations go exclusively through PrivilegedMutationBoundary. apply → verify → rollback path is real. Operator docs (`docs/operations/linux-enduser-guide.md`, prerelease notes) match reality. Packaging scripts are non-interactive and fail-closed. No control-plane changes.
- Verified: `infra/systemd/irp-daemon.service`, `scripts/install-linux.sh`, `scripts/build-linux-daemon-deb.sh`, `apps/daemon/src/host-authorization.ts`, status surfaces, docs.
- Remaining blockers (explicit): Linux runtime soak evidence (#323); Postgres production evidence (#410/#411); exact-SHA CI on the release gate; DNS write policy under non-root (intentionally disabled under `User=irp`); full production certification remains open.
- Honest status: **prerelease / developer-preview only**. Not production-certified. Operators can install on Debian 13, run observe-only safely, and (with explicit opt-in) apply bounded verified route changes that go through apply → verify → rollback. DNS switching is not available under the shipped unit.
- Next: The branch and Pull Request #537 are ready for repository owner review and approval. Final release approval, tagging, and publish remain with the repository owner. Do not treat as production-certified.
