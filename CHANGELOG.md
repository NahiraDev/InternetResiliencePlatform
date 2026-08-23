# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows semantic versioning once releases begin.

## [Unreleased]

### Added

- Phase 45 Network Identity & Destination Policy Assurance with explicit egress and destination evidence contracts.
- Strict identity evidence validation for IPv4/IPv6, declared address family, resolved destination addresses, timestamps, ASN metadata and destination ports.
- Deterministic compliant, non-compliant and insufficient-data assurance outcomes with bounded freshness and independent egress-source enforcement.
- Boundary tests for normalization, malformed evidence, stale/future evidence, insufficient confidence and policy mismatches.
- Phase 45 project-state and verification documentation.

## Phase 16 — Intelligent Auto Failover & Recovery Engine

- Added `@irp/failover` as the Phase 16 resilience orchestrator with normalized failure, recovery plan, state machine, budget, circuit breaker, simulation, explainability, metrics, event, and audit models.
- Documented Phase 16 architecture, subsystem boundaries, policy/security behavior, validation, rollback, degraded mode, plugin extension points, and future AI-ready recovery history.
