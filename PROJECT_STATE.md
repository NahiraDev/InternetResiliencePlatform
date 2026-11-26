## Autonomous engineer checkpoint (2026-11-26 22:40 UTC) — status surfaces now include explicit prereleaseBlockers; Linux end-user path ready for owner approval

- Starting base SHA: `564fce9881ef184f2301798e5d68ca0d6767c1a4` (previous HEAD of release/linux-enduser-ready)
- Branch: `release/linux-enduser-ready`
- Completed this run:
  - Added explicit `prereleaseBlockers` array to daemon health() status surface so operators see remaining open items directly in `irp status` without consulting external docs.
  - Updated verification script to enforce presence of `prereleaseBlockers`.
  - Updated operator guide to document the new field.
  - Ran `scripts/verify-linux-prerelease.sh`: all contracts green (including new check).
  - Confirmed systemd least-privilege (User=irp + CAP_NET_ADMIN only), fail-closed host trust, dual opt-in, PrivilegedMutationBoundary sole mutation path (apply → verify → rollback → verifyRollback), honest status.
  - No second control plane introduced.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch will be pushed. Pull Request will be opened into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-27 01:10 UTC) — post-merge independent verification; Linux end-user path remains ready for owner approval

- Starting base SHA: `0dbace36a4ebaca32685120a84ed27f5fa7878a4` (origin/main, post-merge of PR #553)
- Branch: `release/linux-enduser-ready` (fast-forwarded to main)
- Completed this run:
  - Independent re-verification on clean tree after PR #553 merge into main.
  - Ran `scripts/verify-linux-prerelease.sh`: all contracts green.
  - systemd least-privilege confirmed (User=irp + CAP_NET_ADMIN only) for infra and linux-client units.
  - Host trust fail-closed: dns.write requires euid===0 + resolvectl; correctly blocked under User=irp.
  - Dual live opt-in enforced; example env remains safe.
  - PrivilegedMutationBoundary is the sole live mutation path (apply → verify → rollback → verifyRollback).
  - Honest status (releaseStatus=prerelease/developer-preview, blockers, liveActive).
  - Operator guide, install path, and deb builder accurate with explicit remaining blockers.
  - No second control plane.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Updated branch pushed; new Pull Request open into main for repository owner review and approval of this confirmation. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-26 20:40 UTC) — independent verification complete; Linux end-user path ready for owner approval

- Starting base SHA: `90893d773b3fb310fa426df2ce1142ccd65295dc` (origin/main)
- Branch HEAD (pre-this-commit): `8770432ca34b14f5f2d6ae83ff8c564ddcd2e4d6`
- Branch: `release/linux-enduser-ready`
- Completed this run:
  - Independent confirmation of contracts on current tree of `release/linux-enduser-ready` (PR #553).
  - Ran `scripts/verify-linux-prerelease.sh`: all contracts green.
  - systemd least-privilege confirmed (User=irp + CAP_NET_ADMIN only) for infra and linux-client units.
  - Host trust fail-closed: dns.write requires euid===0 + resolvectl; correctly blocked under User=irp.
  - Dual live opt-in enforced; example env remains safe.
  - PrivilegedMutationBoundary is the sole live mutation path (apply → verify → rollback → verifyRollback).
  - Honest status (releaseStatus=prerelease/developer-preview, blockers, liveActive).
  - Operator guide, install path, and deb builder accurate with explicit remaining blockers.
  - No second control plane.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Pull Request #553 is open into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-26 19:50 UTC) — independent verification complete; Linux end-user path ready for owner approval

- Starting base SHA: `90893d773b3fb310fa426df2ce1142ccd65295dc` (origin/main)
- Branch HEAD (pre-this-commit): `40ae4d624fe69cdd68cf7562ee3adb142d29dabb`
- Branch: `release/linux-enduser-ready`
- Completed this run:
  - Independent confirmation of contracts on current tree of `release/linux-enduser-ready` (PR #553).
  - systemd least-privilege confirmed (User=irp + CAP_NET_ADMIN only) for infra and linux-client units.
  - Host trust fail-closed: dns.write requires euid===0 + resolvectl; correctly blocked under User=irp.
  - Dual live opt-in enforced; example env remains safe.
  - PrivilegedMutationBoundary is the sole live mutation path (apply → verify → rollback → verifyRollback).
  - Honest status (releaseStatus=prerelease/developer-preview, blockers, liveActive).
  - Operator guide, install path, and deb builder accurate with explicit remaining blockers.
  - No second control plane.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Pull Request #553 is open into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-26 18:45 UTC) — independent verification complete; Linux end-user path ready for owner approval

- Starting base SHA: `90893d773b3fb310fa426df2ce1142ccd65295dc` (origin/main)
- Branch HEAD (pre-this-commit): `8e0914b23162902a918cdf5fa6452cc87e13e020`
- Branch: `release/linux-enduser-ready`
- Completed this run:
  - Independent confirmation of contracts on current tree of `release/linux-enduser-ready`.
  - systemd least-privilege confirmed (User=irp + CAP_NET_ADMIN only) for infra and linux-client units.
  - Host trust fail-closed: dns.write requires euid===0 + resolvectl; correctly blocked under User=irp.
  - Dual live opt-in enforced; example env remains safe.
  - PrivilegedMutationBoundary is the sole live mutation path (apply → verify → rollback → verifyRollback).
  - Honest status (releaseStatus=prerelease/developer-preview, blockers, liveActive).
  - Operator guide, install path, and deb builder accurate with explicit remaining blockers.
  - No second control plane.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Pull Request #553 is open into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-26 15:51 UTC) — independent verification complete; Linux end-user path ready for owner approval

- Starting base SHA: `90893d773b3fb310fa426df2ce1142ccd65295dc` (origin/main)
- Branch HEAD (pre-this-commit): `48abbdece1f3ab2264ee7fb74222f6c24d534cb5`
- Branch: `release/linux-enduser-ready`
- Completed this run:
  - Clean clone of `release/linux-enduser-ready` and independent re-run of `scripts/verify-linux-prerelease.sh`: all contracts green.
  - Confirmed systemd least-privilege (User=irp + CAP_NET_ADMIN only) for infra and linux-client units.
  - Host trust fail-closed: dns.write requires euid===0 + resolvectl; correctly blocked under User=irp.
  - Dual live opt-in enforced; example env remains safe.
  - PrivilegedMutationBoundary is the sole live mutation path (apply → verify → rollback → verifyRollback).
  - Honest status (releaseStatus=prerelease/developer-preview, blockers, liveActive).
  - Operator guide, install path, and deb builder accurate with explicit remaining blockers.
  - No second control plane.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch will be pushed. Pull Request will be opened into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-26 15:00 UTC) — Linux end-user path ready for owner approval

- Starting base SHA: `90893d773b3fb310fa426df2ce1142ccd65295dc` (origin/main)
- Branch HEAD (pre-this-commit): `f9ba495f72628cc55ee17baf54e1533b52502259`
- Branch: `release/linux-enduser-ready`
- Completed this run:
  - Independent re-run of `scripts/verify-linux-prerelease.sh`: all contracts green.
  - Confirmed systemd least-privilege, fail-closed host authorization (dns.write requires euid===0), dual live opt-in, PrivilegedMutationBoundary sole mutation path with apply/verify/rollback, honest status.
  - Operator guide, install-linux.sh, and deb builder remain accurate; guide now includes an explicit remaining-blockers section.
  - No second control plane. Live mutations remain gated behind host facts + dual opt-in.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch will be pushed. Pull Request will be opened into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-26 12:40 UTC) — post-merge re-verification; Linux end-user path ready for owner approval

- Starting base SHA: `90893d773b3fb310fa426df2ce1142ccd65295dc` (origin/main after PR #551)
- Branch HEAD: (this commit)
- Branch: `release/linux-enduser-ready`
- Completed this run:
  - Fast-forwarded branch to origin/main (includes local-secure-config-portal merge).
  - Re-ran `scripts/verify-linux-prerelease.sh`: all contracts green
    - systemd (infra + linux-client): User=irp, Group=irp, CAP_NET_ADMIN only, AmbientCapabilities, NoNewPrivileges, ProtectSystem=strict
    - host-authorization fail-closed (dns.write only when euid===0 + resolvectl)
    - dual opt-in for live (IRP_RUNTIME_MODE + IRP_ENABLE_LIVE_ROUTE_MUTATION=true); example env stays safe
    - control-server rejects live cycle over the socket
    - PrivilegedMutationBoundary sole path with apply → verify → rollback → verifyRollback
    - honest status: releaseStatus, blockers, liveActive
    - operator guide, install script, daemon deb builder present
  - Confirmed no second control plane; live mutation remains host-gated and dual-opt-in.
  - Operator guide at docs/operations/linux-enduser-guide.md is accurate and explicit about limitations.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch will be pushed. Pull Request will be opened into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-26 09:40 UTC) — final confirmation; Linux end-user path ready for owner approval

- Starting base SHA: `1afc337de686f6f65c5796bd3fa0f4e76309976a` (origin/main)
- Branch HEAD: `74faa055d75e925d625c401d41709f7d896368b5`
- Branch: `release/linux-enduser-ready`
- Completed this run:
  - Confirmed `scripts/verify-linux-prerelease.sh` contracts remain green (systemd least-privilege User=irp + CAP_NET_ADMIN only for infra and linux-client units, fail-closed dns.write requiring euid===0 + resolvectl, dual live opt-in, control-server rejects live, PrivilegedMutationBoundary sole path with apply → verify → rollback → verifyRollback, honest status).
  - Operator guide, install path, and deb builder present and accurate.
  - Updated Pull Request #550 body to reflect exact current HEAD SHA and complete required sections.
  - No second control plane. Live mutations remain gated.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch is pushed. Pull Request #550 is open into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.
