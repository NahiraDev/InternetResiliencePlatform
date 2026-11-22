# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Current implementation gate

- **Current implementation baseline:** Phases 94–150 implemented on `main` (modules under `packages/resilience-runtime/src/{traffic,telemetry-plane,control-security,fleet,intelligence,dataplane,control-api,governance,scale}` with phase docs and tests); each phase is PARTIAL pending exact-SHA CI evidence and external runtime verification. Phase 93 and earlier baselines are unchanged. ResilienceRuntime remains the sole production mutation authority.
- **Linux end-user ready prerelease checkpoint (2026-11-22):** Open PR #530 on branch `release/linux-enduser-ready` from current main SHA `ded8260954f6a6a6c36ace0f18cb7a7ab57b17e5`. Package version bump to 0.2.6, docs reconciled. systemd unit (`User=irp`, `CAP_NET_ADMIN` only), safe-default `/etc/irp/irp.env`, honest operator docs. DNS write remains disabled under `User=irp`. Single mutation authority unchanged. Some CI checks failing (Linux primary device acceptance, swift analyze); others pass. **Prerelease / developer-preview only — not production-certified.**

- **Issue #12 progress:** The Phase 1–38 evidence register is incomplete: Phases 1–15 are mapped; Phases 16–38 still need evidence reconstruction. Historical paths and test-count records for Phases 39–78 do not establish phase acceptance on the current SHA. Those phases remain PARTIAL unless a separately documented external blocker applies, pending phase-specific acceptance verification and fresh exact-SHA CI evidence.
- **Current open issues (authoritative tracker):** #272 (EPIC: Autonomous Network Superplatform — Full-System Reconstruction & Completion), #323 (Final External Validation Gate — Remote CI, Linux Runtime Soak & Release Evidence), #410/#411 (durable stores / PostgreSQL — implementation present but issue remains open pending production evidence), #463 (Autonomous bandwidth/egress provisioning). #254 and #420 closed as completed.
- **Phase 77 status:** implementation is complete and merged on `main`; the safety/rollback/recovery kernel is available from `@irp/resilience-runtime`.
- **Phase 78 status:** the bounded closed-loop controller is implemented and present on `main`.
- **Phase 79 status:** NetworkIntent model, lifecycle transitions, effective-window evaluation, autonomy levels and dedicated tests are implemented and present on `main` in `packages/core/src/intent.ts` and `intent.test.ts`. Exported from the core barrel.
- **Phase 80 status:** Intent API & Ingestion is implemented on `main` in `apps/api/src/intent-api.ts` (authenticated routes for create/list/get/commands, Idempotency-Key, in-memory and database stores, ownership isolation). Tests in `intent-api.test.ts`. No network mutation from the API boundary.
- **Phase 81 status:** Intent Translation / Compilation is implemented on `main` in `packages/resilience-runtime/src/intent/compiler.ts` (`compileNetworkIntent`, `isCompiledIntentEffective`). Pure, deterministic, side-effect free. Tests present.
- **Phase 82 status:** Intent-scoped Policy Decision & Enforcement is implemented on `main` via `packages/resilience-runtime/src/intent/governance.ts` and autonomy gates in arbitration. Admission decisions, stale rejection, mode-gated mutationAllowed. Tests present. Broader declarative policy language remains later roadmap work.
- **Phase 83 status:** Policy Conflict Resolution implementation present in `arbitration.ts` (arbitrateIntents, InMemoryIntentStore, PostgresIntentStore). Dedicated unit tests added covering no-conflict, priority supersession, version supersession, stale exclusion and store recording. Scopes overlap now requires matching key+value. Disposition PARTIAL pending CI evidence on current SHA.
- **Phase 92 status:** regression evidence for fabric health/freshness signals, observe-only intent drift detection, and re-selection through existing fabric.select boundary merged via PR #415. Disposition PARTIAL pending exact-SHA CI on owning package tests and full continuous assurance.
- **Release state:** GitHub Releases `v0.2.0` and `v0.2.1` are developer-preview/prerelease evidence, not production certification. Production certification remains open. Current main SHA is `ded8260954f6a6a6c36ace0f18cb7a7ab57b17e5`; exact-SHA Release Gate evidence must be verified before any stronger release claim. Releases remain developer-preview / prerelease only. Next intended prerelease is v0.2.6 (Linux end-user ready, still not production-certified).
- **Phase 71 is a separate release-evidence gate:** it does not block architecture implementation in Phases 72–92, but it must not be represented as certified until its evidence exists.
- **Phase 93 status:** advanced route ranking, bounded compiled-intent routing preferences, fail-closed validation, and selection audit evidence are implemented in `packages/resilience-runtime/src/fabric.ts`, with regression coverage in `phase-93-advanced-routing.test.ts`. Disposition PARTIAL pending exact-SHA CI and external runtime evidence. No new runtime authority was introduced.
- **Phases 94–150:** phase documents and corresponding modules exist on main under `packages/resilience-runtime/src/{traffic,telemetry-plane,control-security,fleet,intelligence,dataplane,control-api,governance,scale}` with tests. All modules are additive, pure or injected-clock, advisory, and reach the network only through `PrivilegedMutationBoundary`; data-plane enforcement requires a governed transaction id. Disposition PARTIAL pending exact-SHA CI, review and external runtime evidence; no new runtime authority was introduced and `ResilienceRuntime` remains the sole production mutation authority.

## Phase 79–83 summary

Phases 79–83 establish the intent model, API ingestion boundary, pure compilation to CompiledIntent, intent-scoped admission/enforcement, and deterministic multi-intent conflict resolution (priority/version supersession, overlapping scope detection) without introducing a second control plane. Downstream phases must consume these contracts.

## Phase 71 certification prerequisites

The Phase 71 gate is limited to the release/distribution contract defined by `docs/phases/phase-71.md`. Remaining production certification (device smoke, regional validation, signing, security sign-off) is tracked in open issues and `docs/release/RELEASE_GATE_ROADMAP.md`.

## Canonical evidence locations

- Current state: this file.
- Release path and blockers: `docs/release/RELEASE_GATE_ROADMAP.md`.
- Current post-70 roadmap: `docs/roadmap/MASTER_ROADMAP_V2.md`.
- Historical 0–70 roadmap: `ROADMAP.md`.
- Current phase records: `docs/phases/`.
- Engineering governance: `docs/architecture/engineering-governance.md`.

## Product objective

IRP's long-term objective is a safe, observable and policy-governed Internet control plane that can continuously measure network conditions, diagnose failures, select and apply bounded changes, verify the result, recover from failure and explain decisions across supported clients and network providers.

## Architecture invariants (unchanged)

- ResilienceRuntime remains the canonical runtime authority.
- Never restore NetworkAutopilot as a parallel production control plane.
- No competing authorities for runtime state, policy, decisions, safety, mutation, execution, verification, recovery, intent, or orchestration.

## Linux-first prerelease notes (2026-11-22)

- Linux (Debian 13 / trixie, amd64) is the sole release-critical device gate.
- systemd units (`infra/systemd/irp-daemon.service`, `packages/linux-client/systemd/irp-linux-client.service`) run as `User=irp` / `Group=irp` with `CapabilityBoundingSet=CAP_NET_ADMIN` and `AmbientCapabilities=CAP_NET_ADMIN`.
- Host trust is fail-closed: live route mutation requires operator opt-in (`IRP_RUNTIME_MODE=live` + `IRP_ENABLE_LIVE_ROUTE_MUTATION=true`), CAP_NET_ADMIN, and `ip` on PATH.
- **DNS write status:** DNS switching (`dns.write`) requires root and `resolvectl`. With `User=irp` the process is non-root, so `dns.write` is intentionally not granted. The daemon reports the blocker. DNS mutation is effectively disabled in the packaged systemd service. No bypass of PrivilegedMutationBoundary.
- Mutation path remains exclusively through `@irp/resilience-runtime` + PrivilegedMutationBoundary.
- Current releases (including this prerelease preparation) are developer-preview only. No production certification is claimed.
- Remaining open: Linux runtime soak evidence (#323), Postgres production evidence (#410/#411), exact-SHA CI on the release gate, DNS policy decision (keep disabled or add controlled least-privilege path).

## Autonomous engineer checkpoint (2026-11-22) — current main SHA reconciliation + Phase 150 status

- Starting base SHA: `ded8260954f6a6a6c36ace0f18cb7a7ab57b17e5` (origin/main)
- Branch: `chore/checkpoint-current-sha-ded82609-phase-150`
- Completed this run: Inspected live repo state. Confirmed Phases 94–150 modules and phase documents present on main (e.g. `packages/resilience-runtime/src/scale/certification.ts` for Phase 150 readiness verdict that stays PARTIAL without exact-SHA CI). Updated PROJECT_STATE to exact current main SHA. Open PR #530 (linux-enduser-ready) has mixed CI: Linux primary device and Debian 13 acceptance failing, swift analyze failing, most others success. No new runtime authority. PrivilegedMutationBoundary remains the single mutation path.
- Verified: phase docs exist; certification.ts is pure/advisory; open issues #272/#323/#410/#411/#463 still track external blockers.
- Remaining blockers (explicit): Linux runtime soak evidence (#323); Postgres production evidence (#410/#411); exact-SHA CI evidence for phases 94–150 on current main; DNS write under non-root (intentionally disabled); full production certification remains open. Open PR checks not all green.
- Honest status: **prerelease / developer-preview only**. Not production-certified. Phases 94–150 source present but PARTIAL.
- Next prioritized tasks: address failing checks on PR #530 if root cause is in-scope; obtain Linux soak and Postgres production evidence; collect exact-SHA CI; do not declare Phase 150 complete without evidence.

[previous checkpoints retained for history; see git history for full prior text]
