# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows semantic versioning once releases begin.

## [Unreleased]

### Fixed

- Release pipeline (PR #2, published as v0.2.1): the Windows bundle job no longer fails on `$env:RELEASE_TAG` being expanded by bash; Windows zips use forward-slash entry names; the iOS source zip no longer contains SwiftPM `.build/` products; the Linux bundle is now a self-contained installable pnpm mini-workspace with a fail-closed smoke test (`pnpm install` + `GET /health`); compiled test files are pruned from platform bundles; every platform packaging step has fail-closed content guards.
- v0.2.0 is marked prerelease: its Linux bundle was not runnable outside the monorepo (workspace symlinks), its iOS zip shipped ~6,400 generated files and its Windows zip used backslash entry names.

- Release gate: restored the `IRP Release` workflow with a fail-closed check that the tagged commit has a passing Release Gate.
- Release gate: iOS Full Client now builds against the generic iOS Simulator destination instead of a simulator runtime that is not installed on the runner.
- Release gate: Public Runtime Lab soak retries transport-level errors from the Quick Tunnel in a bounded way while still failing on persistent errors and non-200 readiness.
- Integration baseline: API and daemon runtime reports now record verified workspace integrations, so `pnpm integration:baseline` passes.
- Security: raised the `@fastify/static` override to 10.1.5 (authorization bypass via non-canonical paths).
- Docs: download page matches the Phase 71 asset names and documents `SHA256SUMS.txt` verification.

### Added

- `docs/release/RELEASE_GATE_ROADMAP.md`: ordered path from current `main` to Phase 71 certification, production certification and the post-v1 roadmap.

- Phase 45 Network Identity & Destination Policy Assurance with explicit egress and destination evidence contracts.
- Strict identity evidence validation for IPv4/IPv6, declared address family, resolved destination addresses, timestamps, ASN metadata and destination ports.
- Deterministic compliant, non-compliant and insufficient-data assurance outcomes with bounded freshness and independent egress-source enforcement.
- Boundary tests for normalization, malformed evidence, stale/future evidence, insufficient confidence and policy mismatches.
- Phase 45 project-state and verification documentation.

## Phase 16 — Intelligent Auto Failover & Recovery Engine

- Added `@irp/failover` as the Phase 16 resilience orchestrator with normalized failure, recovery plan, state machine, budget, circuit breaker, simulation, explainability, metrics, event, and audit models.
- Documented Phase 16 architecture, subsystem boundaries, policy/security behavior, validation, rollback, degraded mode, plugin extension points, and future AI-ready recovery history.
