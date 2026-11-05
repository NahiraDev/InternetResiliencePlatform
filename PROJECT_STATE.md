# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Current implementation gate

- **Current implementation baseline:** Phases 94–150 modules and phase documents are present on `main`. Each phase remains PARTIAL pending exact-SHA CI evidence and external runtime/device evidence. ResilienceRuntime remains the sole production mutation authority.
- **Current main HEAD inspected (2026-11-05):** `28cbe4ebe343a352835f331eee72f1fbc09f8a0f`.
- **Issue #12 progress:** The Phase 1–38 evidence register is incomplete: Phases 1–15 are mapped; Phases 16–38 still need evidence reconstruction. Historical paths and test-count records for Phases 39–78 do not establish phase acceptance on the current SHA. Those phases remain PARTIAL unless a separately documented external blocker applies, pending phase-specific acceptance verification and fresh exact-SHA CI evidence.
- **Current open issues (authoritative tracker):** #254 (Linux Client runtime wiring), #272 (EPIC: Autonomous Network Superplatform — Full-System Reconstruction & Completion), #284 (Workstream: Full Verification, CI/CD, Deployment & Final Evidence), #323 (Final External Validation Gate — Remote CI, Linux Runtime Soak & Release Evidence), #410/#411/#412 (durable stores / auth / PostgreSQL), #413 (reconcile project state), #420 (CodeQL workflow).
- **Phase 77–93 status:** implementations present on main as previously recorded.
- **Phases 94–150 status:** phase documents and corresponding modules exist on main under `packages/resilience-runtime/src/{traffic,telemetry-plane,control-security,fleet,intelligence,dataplane,control-api,governance,scale}` with tests. All modules are additive, pure or injected-clock, advisory, and reach the network only through `PrivilegedMutationBoundary`; data-plane enforcement requires a governed transaction id. Disposition PARTIAL pending exact-SHA CI, review and external runtime evidence; no new runtime authority was introduced.
- **Release state:** GitHub Releases `v0.2.0` and `v0.2.1` are developer-preview/prerelease evidence, not production certification. Production certification remains open.
- **Phase 71 is a separate release-evidence gate.**

## Architecture invariants (unchanged)

- ResilienceRuntime remains the canonical runtime authority.
- Never restore NetworkAutopilot as a parallel production control plane.
- No competing authorities for runtime state, policy, decisions, safety, mutation, execution, verification, recovery, intent, or orchestration.

## Autonomous engineer checkpoint (2026-11-05)

- Starting base SHA: 28cbe4ebe343a352835f331eee72f1fbc09f8a0f (upstream/main)
- Ending base SHA: (pending this PR)
- Completed this run: reconciled PROJECT_STATE.md with live main SHA. Inspected open PR #480 (gateway lifecycle, CI unstable). System Assurance workflow on main SHA 28cbe4e failed because package-integration.mjs reported missing dist/index.js for @irp/daemon and @irp/linux-client after workspace build (entry not found). Linux network-namespace e2e and several mobile/client CodeQL jobs failed on PR #480 head.
- Branches/PRs: chore/reconcile-project-state-28cbe4e (this PR)
- Actual CI: System Assurance FAIL on main (job 126940320938); PR #480 checks include failures on Linux netns e2e, iOS, Android, Swift/Java-Kotlin analysis.
- Verified merges: recent gateway fixes (#478, #479) merged.
- Blockers: exact-SHA CI evidence blocked by System Assurance package artifact gaps and platform CI failures; durable stores (#410); auth (#412); Linux soak (#254/#323); CodeQL config (#420).
- Next prioritized tasks: diagnose and fix System Assurance missing dist artifacts (ensure builds produce expected entrypoints or adjust assurance if expectation is incorrect); address PR #480 CI failures; continue evidence for 94-150; address durable/auth blockers.
