# Project State — Internet Resilience Platform

**Status:** prerelease / developer-preview (not production-certified)  
**Branch:** `release/linux-enduser-ready`  
**Base (main) SHA:** `4d402650f7beee21ba2ccd5c646557577471fa99`  
**Last autonomous verification:** 2026-11-25

## What works correctly today on Linux

- **Daemon install and start under systemd (`User=irp`)**  
  - Unit: `infra/systemd/irp-daemon.service`  
  - `User=irp`, `Group=irp`, `CapabilityBoundingSet=CAP_NET_ADMIN`, `AmbientCapabilities=CAP_NET_ADMIN`  
  - `NoNewPrivileges=true`, `ProtectSystem=strict`, restricted address families  
  - Install paths: `scripts/install-linux.sh` (source checkout) and `scripts/build-linux-daemon-deb.sh` (Debian package)  
  - Non-interactive; creates system user, state dirs, and safe default `/etc/irp/irp.env`

- **Host trust is fail-closed and correctly reported**  
  - Implementation: `apps/daemon/src/host-authorization.ts`  
  - Live requires: Linux + effective `CAP_NET_ADMIN` + `ip` on PATH + dual operator opt-in  
  - Dual opt-in: `IRP_RUNTIME_MODE=live` **and** `IRP_ENABLE_LIVE_ROUTE_MUTATION=true` (`apps/daemon/src/daemon-config.ts`)  
  - Missing any fact → effective mode falls back to safe; blockers listed explicitly in status

- **DNS write honesty**  
  - `dns.write` additionally requires `euid === 0` and `resolvectl`  
  - Under shipped `User=irp` this capability is **never** granted; reported as a blocker, not pretended

- **Status is honest (live vs safe + blockers)**  
  - `GET /v1/health` and CLI status include:  
    - `releaseStatus: "prerelease / developer-preview (not production-certified)"`  
    - `authorization.requestedMode`, `effectiveMode`, `liveActive`  
    - `authorization.blockers`, `authorization.evidence` (platform, euid, CAP_NET_ADMIN, ip, resolvectl)

- **All live mutations go only through PrivilegedMutationBoundary**  
  - `packages/resilience-runtime/src/transactions/privileged-boundary.ts`  
  - Phases: prepare → (gates) → apply → verify → commit  
  - On post-apply failure: rollback → verifyRollback → recover  
  - No second control plane

- **Operator documentation matches reality**  
  - `docs/operations/linux-enduser-guide.md`  
  - `docs/operations/running-the-daemon.md`  
  - Covers install, start/stop, status, config, what the system will and will not do

## Explicit remaining blockers (not hidden)

1. Linux runtime soak / external validation evidence (#323)  
2. PostgreSQL production deployment evidence (#410 / #411)  
3. Exact-SHA CI cleanliness (Docker smoke is non-blocking for the Linux daemon path)  
4. DNS write under non-root `User=irp` (intentionally disabled; requires root or polkit)  
5. Full production certification / Phase 150 evidence remains open  

## Release posture

- Explicitly **prerelease / developer-preview only**.  
- **Not** production-certified.  
- Final release approval, tagging, and publish remain exclusively with the repository owner.  
- This branch + PR prepare the decision point; they do not claim production readiness.

## Recent autonomous work

- Strengthened deployment contract tests to lock `infra/systemd/irp-daemon.service` (User=irp, CAP_NET_ADMIN-only, RestrictAddressFamilies) and safe defaults in `irp.env.example`.  
- Independent re-verification of host-authorization, PrivilegedMutationBoundary, status surfaces, install/packaging scripts, and operator docs.  
- Consolidated this document to a single honest current-state view (previous repeated checkpoint noise removed).
