# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

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
