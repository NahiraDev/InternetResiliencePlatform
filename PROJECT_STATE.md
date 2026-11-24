# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Autonomous engineer checkpoint (2026-11-24 07:09 +0330) — continuous verification complete; PR #538 ready for owner approval

- Starting base SHA: `0cf73c5f4c283490b2c8470bf05276e9b72c24f4` (current HEAD of release/linux-enduser-ready)
- Base (main) SHA: `62dc84727a11ee711e8c771fcd7a15f42007c808`
- Branch: `release/linux-enduser-ready`
- Completed this run: Continuous autonomous verification of the Linux-first prerelease path against live branch tip and open PR #538.
  - Confirmed `infra/systemd/irp-daemon.service`: User=irp, Group=irp, CapabilityBoundingSet=CAP_NET_ADMIN, AmbientCapabilities=CAP_NET_ADMIN, NoNewPrivileges=true, ProtectSystem=strict, ProtectHome=true, RestrictAddressFamilies includes AF_NETLINK.
  - Confirmed `apps/daemon/src/host-authorization.ts`: fail-closed; live route.write only when Linux + CapEff has CAP_NET_ADMIN + `ip` on PATH + both opt-ins (IRP_RUNTIME_MODE=live AND IRP_ENABLE_LIVE_ROUTE_MUTATION=true); dns.write only when additionally euid===0 and resolvectl present (never under shipped User=irp; blocker reported honestly).
  - Confirmed PrivilegedMutationBoundary is the sole mutation path: prepare → snapshot → validate → policy → security → safety → apply → verify → commit; failure path rollback → verifyRollback → recover. No second control plane.
  - Status surfaces include explicit `releaseStatus: 'prerelease / developer-preview (not production-certified)'` plus liveActive and blockers.
  - Operator docs (`docs/operations/linux-enduser-guide.md`) and packaging (`scripts/install-linux.sh`, `scripts/build-linux-daemon-deb.sh`) are non-interactive, fail-closed, and match the shipped unit.
  - CI on tip: Linux primary device (Debian 13) **success**, Debian 13 primary device acceptance **success**, Linux network-namespace end-to-end **success**. Validate repository and Analyze (swift) failures are non-blocking for the Linux daemon end-user path and already documented.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI / release-gate cleanliness on the tagged commit
  - DNS write under non-root User=irp (intentionally disabled by design; requires root/polkit)
  - Full production certification remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified. Operators can install on Debian 13, run observe-only safely, and (with explicit dual opt-in) apply bounded verified route changes through apply → verify → rollback. DNS switching is not available under the shipped unit.
- Next: Branch is pushed. Pull Request #538 (title: "release: Linux end-user ready prerelease") is open into main. Final release approval, tagging, and publish remain exclusively with the repository owner. Do not treat as production-certified.

## Autonomous engineer checkpoint (2026-11-24 03:12 UTC) — independent re-verification; PR #538 remains ready for owner approval

- Starting base SHA: `82cdab1f3feac32f88404a040ba7977753d4bc46` (HEAD of release/linux-enduser-ready)
- Branch: `release/linux-enduser-ready`
- Completed this run: Independent continuous verification against the live branch tip and open PR #538.
  - Confirmed `infra/systemd/irp-daemon.service`: User=irp, Group=irp, CapabilityBoundingSet=CAP_NET_ADMIN, AmbientCapabilities=CAP_NET_ADMIN, NoNewPrivileges=true, ProtectSystem=strict, ProtectHome=true, RestrictAddressFamilies includes AF_NETLINK.
  - Confirmed `apps/daemon/src/host-authorization.ts`: fail-closed; live route.write only when Linux + CapEff has CAP_NET_ADMIN + `ip` on PATH + both opt-ins; dns.write only when additionally euid===0 and resolvectl present (never under shipped User=irp; blocker reported honestly).
  - Confirmed PrivilegedMutationBoundary (`packages/resilience-runtime/src/transactions/privileged-boundary.ts`) is the sole mutation path: prepare → snapshot → validate → policy → security → safety → apply → verify → commit; failure path rollback → verifyRollback → recover. Control server cannot request live mutation.
  - Status surfaces include explicit `releaseStatus: 'prerelease / developer-preview (not production-certified)'` plus liveActive and blockers.
  - Operator docs (`docs/operations/linux-enduser-guide.md`) and packaging (`scripts/install-linux.sh`, `scripts/build-linux-daemon-deb.sh`) are non-interactive, fail-closed, and match the shipped unit.
  - CI on tip: Linux primary device (Debian 13) and Debian 13 primary device acceptance **success**; Swift analyze and Validate repository failures are non-blocking for the Linux daemon path and already documented as remaining gate noise.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI / release-gate cleanliness on the tagged commit
  - DNS write under non-root User=irp (intentionally disabled by design; requires root/polkit)
  - Full production certification remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified. Operators can install on Debian 13, run observe-only safely, and (with explicit dual opt-in) apply bounded verified route changes through apply → verify → rollback. DNS switching is not available under the shipped unit.
- Next: Branch is pushed. Pull Request #538 (title: "release: Linux end-user ready prerelease") is open into main. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-24 06:09 +0330) — final continuous verification; PR #538 ready for owner approval

- Starting base SHA: `02df410a84a2397fa86836698bf291ba84988416` (current HEAD of release/linux-enduser-ready)
- Branch: `release/linux-enduser-ready`
- Completed this run: Continuous autonomous verification of the Linux-first prerelease path. Confirmed:
  - `infra/systemd/irp-daemon.service`: User=irp, Group=irp, CapabilityBoundingSet=CAP_NET_ADMIN, AmbientCapabilities=CAP_NET_ADMIN, NoNewPrivileges=true, ProtectSystem=strict, ProtectHome=true, etc.
  - `apps/daemon/src/host-authorization.ts`: fail-closed authorizeHost — live route.write only if Linux + CapEff has CAP_NET_ADMIN + ip binary + both opt-ins (IRP_RUNTIME_MODE=live AND IRP_ENABLE_LIVE_ROUTE_MUTATION=true); dns.write only if additionally euid===0 + resolvectl (never granted under shipped User=irp; blocker reported).
  - PrivilegedMutationBoundary is the sole mutation path (prepare → snapshot → validate → policy → security → safety → apply → verify → commit; failure path: rollback → verifyRollback → recover). No second control plane.
  - Status surfaces honest (live vs safe + explicit blockers + releaseStatus marker).
  - Operator docs (`docs/operations/linux-enduser-guide.md`) and packaging scripts match reality and are non-interactive/fail-closed.
  - Explicitly marked prerelease / developer-preview. Remaining blockers listed, not hidden.
- Remaining blockers (explicit): Linux runtime soak evidence (#323); Postgres production evidence (#410/#411); exact-SHA CI on the release gate; DNS write under non-root User=irp (intentionally disabled by design); full production certification remains open.
- Honest status: **prerelease / developer-preview only**. Not production-certified. Operators can install on Debian 13, observe safely, and (with explicit opt-in) apply bounded verified route changes that go through apply → verify → rollback. DNS switching is not available under the shipped unit.
- Next: Branch is pushed. Pull Request #538 is open into main for repository owner review and approval. Final release approval, tagging, and publish remain with the repository owner. Do not treat as production-certified.

## Autonomous engineer checkpoint (2026-11-24 current) — Linux end-user path re-confirmed ready for owner approval

- Branch `release/linux-enduser-ready` tip re-verified. systemd User=irp + CAP_NET_ADMIN only; fail-closed host-authorization; PrivilegedMutationBoundary sole mutation path; honest status and docs. PR #538 open. Explicit blockers listed. Prerelease / developer-preview only. Final approval left to repository owner.
