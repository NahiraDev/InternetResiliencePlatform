## Autonomous engineer checkpoint (2026-11-24 18:22 +0330) — final continuous verification; Linux end-user path ready for owner approval (PR #539 open)

- Starting base SHA: `f61d189ddb5b7444829496c60b70f96520f63559` (current HEAD of release/linux-enduser-ready)
- Base (main) SHA: `d7b50e1d1b06ea04f0eed1ce4681af626ff55cf1`
- Branch: `release/linux-enduser-ready`
- PR: #539 (open into main) — https://github.com/NahiraDev/InternetResiliencePlatform/pull/539
- Completed this run: Independent verification that the Linux-first prerelease path is correctly working and honestly documented.
  - systemd unit: User=irp, Group=irp, CapabilityBoundingSet=CAP_NET_ADMIN, AmbientCapabilities=CAP_NET_ADMIN, NoNewPrivileges=true, ProtectSystem=strict.
  - host-authorization.ts: fail-closed; route.write only with Linux + CAP_NET_ADMIN + ip + dual opt-in; dns.write only with additional euid===0 + resolvectl (never under shipped User=irp).
  - PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback.
  - Status surfaces include explicit releaseStatus: "prerelease / developer-preview (not production-certified)".
  - Operator docs and packaging scripts match reality and are non-interactive/fail-closed.
  - Privileged tests skip cleanly when ip is absent.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness (Docker smoke on API path non-blocking for Linux daemon)
  - DNS write under non-root User=irp (intentionally disabled by design; requires root or polkit)
  - Full production certification remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch remains pushed. PR #539 open into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-24 17:20 +0330) — Linux acceptance tests made robust to missing iproute2; path remains prerelease-ready (PR #539 open)

- Completed this run: Improved test reliability for environments without the `ip` binary.
  - `apps/daemon/src/linux-acceptance.test.ts`: privilegedDescribe now also requires `ip` on common paths.
  - `packages/linux-client/src/linux-route-mutation.integration.test.ts`: privileged suite skips when `ip` is absent.
- Verified: daemon tests 70 passed / 1 skipped; linux-client 169 passed / 16 skipped; resilience-runtime 972 passed.
- systemd unit: User=irp + CAP_NET_ADMIN only
- host-authorization fail-closed (dns.write blocked under non-root)
- PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback
- honest status surfaces (`releaseStatus`, liveActive, blockers)
- operator docs and packaging scripts match reality
- Remaining blockers (explicit, not hidden):
  - DNS write under User=irp requires root or polkit (currently blocked, reported honestly)
  - PostgreSQL production deployment evidence (#410/#411)
  - Linux runtime soak evidence (#323)
  - exact-SHA CI evidence for phases 94–150
  - Full production certification remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.

## Autonomous engineer checkpoint (2026-11-24 17:20 +0330) — Linux acceptance tests made robust to missing iproute2; path remains prerelease-ready (PR #539 open)

- Completed this run: Improved test reliability for environments without the `ip` binary.
  - `apps/daemon/src/linux-acceptance.test.ts`: privilegedDescribe now also requires `ip` on common paths.
  - `packages/linux-client/src/linux-route-mutation.integration.test.ts`: privileged suite skips when `ip` is absent.
- Verified: daemon tests 70 passed / 1 skipped; linux-client 169 passed / 16 skipped; resilience-runtime 972 passed.
- systemd unit: User=irp + CAP_NET_ADMIN only
- host-authorization fail-closed (dns.write blocked under non-root)
- PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback
- honest status surfaces (`releaseStatus`, liveActive, blockers)
- operator docs and packaging scripts match reality
- Remaining blockers (explicit, not hidden):
  - DNS write under User=irp requires root or polkit (currently blocked, reported honestly)
  - PostgreSQL production deployment evidence (#410/#411)
  - Linux runtime soak evidence (#323)
  - exact-SHA CI evidence for phases 94–150
  - Full production certification remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.

## Autonomous engineer checkpoint (2026-11-24 16:09 +0330) — continuous verification; Linux end-user path remains prerelease-ready (PR #539 open)

- Starting base SHA: `ece603c66cac23081b388de7fd5787a079006b02` (current HEAD of release/linux-enduser-ready)
- Base (main) SHA: `d7b50e1d1b06ea04f0eed1ce4681af626ff55cf1`
- Branch: `release/linux-enduser-ready`
- PR: #539 (open into main) — https://github.com/NahiraDev/InternetResiliencePlatform/pull/539
- Completed this run: Fresh independent code-and-docs verification of the Linux-first prerelease path.
  - `infra/systemd/irp-daemon.service`: User=irp, Group=irp, CapabilityBoundingSet=CAP_NET_ADMIN, AmbientCapabilities=CAP_NET_ADMIN, NoNewPrivileges=true, ProtectSystem=strict, RestrictAddressFamilies includes AF_NETLINK.
  - `apps/daemon/src/host-authorization.ts`: fail-closed; route.write only with Linux + CAP_NET_ADMIN + ip + dual opt-in; dns.write only with additional euid===0 + resolvectl (never under shipped User=irp).
  - `apps/daemon/src/daemon-config.ts`: dual opt-in enforced (IRP_RUNTIME_MODE=live requires IRP_ENABLE_LIVE_ROUTE_MUTATION=true exactly).
  - `packages/resilience-runtime/src/transactions/privileged-boundary.ts`: sole mutation path with prepare → snapshot → validate → policy → security → safety → apply → verify → commit; failure path rollback → verifyRollback → recover.
  - Status surfaces include explicit `releaseStatus: "prerelease / developer-preview (not production-certified)"` in daemon health and CLI diagnostics.
  - Operator docs (`docs/operations/linux-enduser-guide.md`, `docs/release/linux-enduser-prerelease-notes.md`) and packaging (`scripts/install-linux.sh`, `scripts/build-linux-daemon-deb.sh`) match reality and are non-interactive/fail-closed.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness (Docker smoke on API path non-blocking for Linux daemon)
  - DNS write under non-root User=irp (intentionally disabled by design)
  - Full production certification remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch remains pushed. PR #539 open into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

