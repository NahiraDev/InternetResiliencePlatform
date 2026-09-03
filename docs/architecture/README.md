# Architecture

This directory contains canonical architecture and engineering-governance documentation for IRP. Historical implementation evidence belongs under `docs/phases/` and `docs/audits/`.

## Start here

1. [Product architecture](product-architecture.md) — product boundaries and client contracts.
2. [Platform model](platform-model.md) — Web, Desktop, Mobile, server, gateway and control-plane roles.
3. [Architecture overview](overview.md) — implemented system overview.
4. [System architecture](system-architecture.md) — current subsystem structure.
5. [Data and control flow](data-flow.md) — evidence, decisions, actions and verification.
6. [Resilience runtime](resilience-runtime.md) — runtime behavior and lifecycle.
7. [Live control plane](live-control-plane.md) — current control-plane behavior.
8. [Security boundaries](security-boundaries.md) — trust zones and security responsibilities.
9. [Event stream](event-stream.md) — event contracts and flow.
10. [Runtime adapter model](runtime-adapter-model.md) — runtime adapters.

## Product planning

- [Current post-70 roadmap](../roadmap/MASTER_ROADMAP_V2.md) — Phases 72–150 and dependency rules.
- [Control-plane execution baseline](../audits/control-plane-execution-baseline-2026-09-03.md) — current ownership/gap audit.
- [Historical 0–70 product plan](product-roadmap-70-phases.md) — retained as the v1/historical baseline.
- [Release gates](release-gates.md) — completion and release evidence.
- [Engineering governance](engineering-governance.md) — architecture and repository growth rules.

## Reading rule

Architecture documents describe current structure and durable boundaries. Planned behavior must be explicitly identified as planned. `PROJECT_STATE.md`, tests, runtime evidence, and CI determine implementation status.

When historical and current roadmap documents differ, use `PROJECT_STATE.md` for the current implementation gate and `docs/roadmap/MASTER_ROADMAP_V2.md` for current post-70 planning. Historical 0–70 documents do not override those sources.
