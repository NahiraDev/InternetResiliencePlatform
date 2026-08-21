# InternetResiliencePlatform Documentation

This directory is the documentation source of truth for the implementation currently present in `main`.

## Canonical documents

| Document | Purpose |
| --- | --- |
| [Current architecture](current-architecture.md) | Current runtime, package, API, security, telemetry and deployment boundaries |
| [Architecture principles](architecture-principles.md) | Stable engineering and safety principles |
| [Security architecture](security-architecture.md) | Authentication, authorization, rate limiting, SSRF, secrets and failure-closed rules |
| [Configuration](configuration.md) | Runtime configuration and environment contract |
| [Development](development.md) | Local development and verification workflow |
| [Roadmap](../ROADMAP.md) | Product and engineering phase roadmap |
| [Phase index](phases/README.md) | Phase history and completion state |
| [ADR index](adr/README.md) | Architecture decisions |

## Current implementation status

The repository is currently at **Phase 39 — Remote/Mobile Client Connectivity & Security Hardening**.

Implemented foundations include endpoint intelligence, historical analysis, metrics, OpenTelemetry, production reliability/SLO evaluation, security hardening, Docker runtime hardening, and operational diagnostics. Phase 39 adds reusable device credentials, rotating refresh-token primitives, bounded remote-client scopes, and security-audit primitives in `@irp/auth`.

Phase 39 is **not considered fully complete until the reusable security primitives are wired into the API authentication lifecycle and the repository verification gates pass**. See [Phase 39](phases/phase-39.md).

## Documentation policy

1. Documentation must describe code that exists on `main`, not proposed architecture presented as implemented functionality.
2. `README.md`, `ROADMAP.md`, `PROJECT_STATE.md`, and this directory must not claim different current phases.
3. Historical phase material is retained for traceability, but it is not an operational source of truth.
4. New architecture decisions belong in `docs/adr/`.
5. Phase completion reports belong under `docs/phases/` and must state implementation status and verification status separately.
6. Generated reports, raw audit dumps and temporary verification artifacts must not be added to the canonical documentation tree.
