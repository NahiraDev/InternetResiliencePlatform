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

(Full prior checkpoints preserved below.)
