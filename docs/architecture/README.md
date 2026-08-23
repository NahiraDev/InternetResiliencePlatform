# Architecture

This directory contains canonical architecture and engineering-governance documentation for IRP. Historical implementation evidence belongs under `docs/phases/`.

## Start here

1. [Product architecture](product-architecture.md) — cross-platform product boundaries and client contract.
2. [Architecture overview](overview.md) — implemented system overview.
3. [System architecture](system-architecture.md) — current subsystem structure.
4. [Resilience runtime](resilience-runtime.md) — runtime behavior and lifecycle.
5. [Live control plane](live-control-plane.md) — current control-plane behavior.
6. [Event stream](event-stream.md) — event contracts and flow.
7. [Runtime adapter model](runtime-adapter-model.md) — runtime adapters.

## Product planning

- [70-phase product plan](product-roadmap-70-phases.md) — phase contracts and dependencies.
- [Release gates](release-gates.md) — completion and release evidence.
- [Engineering governance](engineering-governance.md) — architecture and repository growth rules.

## Reading rule

Architecture documents describe current structure and durable boundaries. Planned behavior must be explicitly identified as planned. `PROJECT_STATE.md`, tests, runtime evidence, and CI determine implementation status.
