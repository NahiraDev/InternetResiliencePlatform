# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Autonomous engineer checkpoint (2026-11-23) — Linux end-user ready (current branch)

- Starting base SHA: `260c67915a7755d533c925a68cc1ce3e81a94298` (origin/main)
- Branch: `release/linux-enduser-ready`
- Completed this run: Confirmed the Linux end-user path is coherent and honest on current main. Packaging (`scripts/build-linux-daemon-deb.sh`, `scripts/install-linux.sh`) is non-interactive and fail-closed. systemd unit runs as `User=irp` with only `CAP_NET_ADMIN`. Host-authorization is fail-closed (route.write requires live opt-in + CAP_NET_ADMIN + `ip`; dns.write requires root + `resolvectl` and is therefore never granted under the shipped unit). Status surfaces report live vs safe and list blockers. All mutations go exclusively through PrivilegedMutationBoundary. Operator docs (`docs/operations/linux-enduser-guide.md`, prerelease notes) are accurate. No control-plane changes.
- Verified: systemd unit, install/build scripts, host-authorization.ts, end-user guide, prerelease notes.
- Remaining blockers (explicit): Linux runtime soak evidence (#323); Postgres production evidence (#410/#411); exact-SHA CI on the release gate; DNS write policy under non-root (intentionally disabled); full production certification remains open.
- Honest status: **prerelease / developer-preview only**. Not production-certified. Operators can install on Debian 13, run observe-only safely, and (with explicit opt-in) apply bounded verified route changes that go through apply → verify → rollback. DNS switching is not available under the shipped `User=irp` unit.
- Next: open/update PR for owner approval; obtain Linux soak evidence; keep DNS write disabled or design a least-privilege alternative; continue exact-SHA evidence collection.

(Full historical checkpoints preserved below from prior reconciliations.)

## Current implementation gate

- Linux end-user packaging, systemd unit, and docs are coherent on main. This branch reconciles state for owner review of the prerelease.
- **Prerelease / developer-preview only — not production-certified.**

See full history in prior commits on this branch and main.
