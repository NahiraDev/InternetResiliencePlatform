## Phase 119 tenant isolation (2026-11-27) — PARTIAL, PR pending CI and owner review

- Follow-up branch `phase/119-tenant-isolation` carries the Phase 119 API/runtime hardening after PR #557 merged.
- Adds write-time role rechecks, denial auditing, per-organization quotas, required update versions, concurrency protections and archived-parent isolation.
- The supplied patch records local API 245/245 on PostgreSQL 16.15; build, lint, typecheck and validation passing; full test run 87/88 (one `@irp/gateway-registry` sandbox-network failure). This report has not been independently rerun on the follow-up commit.
- Exact-head GitHub CI and owner approval remain outstanding. The breaking `PATCH` requirement and quota defaults need client/owner review; no live or production-environment validation is claimed.
- Phase 120 has not been started. Details: `docs/phases/phase-119.md`.

## Autonomous engineer checkpoint (2026-11-27 15:57 UTC) — independent verification complete; Linux end-user path ready for owner approval

- Starting base SHA: `f3dbcf07e2f58679266194b17816c44294a67866` (origin/main, post PR #559 merge)
- Branch tip at verification: `028539b53c6961b9be404f45c82b79f4d83439b7` (pre-this-commit)
- Completed this run:
  - Clean checkout of `release/linux-enduser-ready`.
  - Ran `scripts/verify-linux-prerelease.sh`: all contracts green (systemd least-privilege User=irp + CAP_NET_ADMIN only for infra and linux-client units, fail-closed host trust for dns.write requiring euid===0 + resolvectl, dual live opt-in, control-server rejects live, PrivilegedMutationBoundary sole mutation path with apply→verify→rollback→verifyRollback, honest status surface with prereleaseBlockers and releaseStatus, packaging version 0.3.0-prerelease, operator docs).
  - Confirmed no second control plane.
  - Operator guide, install path, and Debian packaging accurately describe prerelease limitations and remaining blockers.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch remains pushed; Pull Request #560 is open into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-27 18:30 UTC) — independent verification complete; Linux end-user path ready for owner approval

- Starting base SHA: `f3dbcf07e2f58679266194b17816c44294a67866` (origin/main, post PR #559 merge)
- Branch tip at verification: `af6ce7a98ea9896303f51356d77a819b39b7e959` (pre-this-commit)
- Completed this run:
  - Inspected `release/linux-enduser-ready` contracts via GitHub API and source review.
  - Confirmed systemd units (infra and linux-client) enforce User=irp, CapabilityBoundingSet=CAP_NET_ADMIN only (no CAP_SYS_ADMIN), AmbientCapabilities=CAP_NET_ADMIN, NoNewPrivileges=true, ProtectSystem=strict.
  - Host trust fail-closed: dns.write requires euid === 0 + resolvectl; correctly blocked and reported under non-root User=irp.
  - Dual live opt-in enforced; control socket rejects live cycles.
  - PrivilegedMutationBoundary is the sole live mutation path (apply → verify → rollback → verifyRollback).
  - Honest status surface reports releaseStatus=prerelease/developer-preview, prereleaseBlockers, liveActive, and authorization blockers.
  - Aligned `@irp/daemon` package.json version to `0.3.0-prerelease` to match Debian packaging default (scripts/build-linux-daemon-deb.sh).
  - Operator guide, install path, and docs accurately describe limitations and remaining blockers. No second control plane.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch remains pushed; Pull Request #560 is open into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-27 15:00 UTC) — independent verification complete; Linux end-user path ready for owner approval

- Starting base SHA: `f3dbcf07e2f58679266194b17816c44294a67866` (origin/main, post PR #559 merge)
- Branch tip at verification: `b8a22b26ae4640cc76cda8a702c6d682ab48334c` (pre-this-commit)
- Completed this run:
  - Clean checkout of `release/linux-enduser-ready` from origin.
  - Ran `scripts/verify-linux-prerelease.sh`: all contracts green (systemd least-privilege User=irp + CAP_NET_ADMIN only for infra and linux-client units, fail-closed host trust for dns.write requiring euid===0 + resolvectl, dual live opt-in, control-server rejects live, PrivilegedMutationBoundary sole mutation path with apply→verify→rollback→verifyRollback, honest status surface with prereleaseBlockers and releaseStatus, packaging version 0.3.0-prerelease, operator docs).
  - Local `node scripts/validate-repository.mjs`, architecture contract, and validate-repository tests: green.
  - Confirmed no second control plane.
  - Operator guide, install path, and Debian packaging accurately describe prerelease limitations and remaining blockers.
  - Open Pull Request #560 is current for owner review. Note: CI job "Validate repository" reported failure on the prior tip (linux-primary / netns-e2e / architecture succeeded); local contract validation is green.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch remains pushed; Pull Request #560 is open into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-27 13:50 UTC) — independent verification complete; Linux end-user path ready for owner approval

- Starting base SHA: `f3dbcf07e2f58679266194b17816c44294a67866` (origin/main, post PR #559 merge)
- Branch tip at verification: `0436b192a4be4a58bffab6eb4abf41c1369e2d90`
- Completed this run:
  - Clean checkout of `release/linux-enduser-ready`.
  - Ran `scripts/verify-linux-prerelease.sh`: all contracts green (systemd least-privilege User=irp + CAP_NET_ADMIN only for infra and linux-client units, fail-closed host trust for dns.write requiring euid===0 + resolvectl, dual live opt-in, control-server rejects live, PrivilegedMutationBoundary sole mutation path with apply→verify→rollback→verifyRollback, honest status surface with prereleaseBlockers and releaseStatus, packaging version 0.3.0-prerelease, operator docs).
  - Confirmed no second control plane.
  - Operator guide, install path, and Debian packaging accurately describe prerelease limitations and remaining blockers.
  - Open Pull Request #560 is current and matches requirements.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch is pushed; Pull Request #560 is open into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.
