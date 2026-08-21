# InternetResiliencePlatform Documentation

This directory is the documentation source of truth for the implementation currently present in `main`.

## Start here

| Document | Purpose |
| --- | --- |
| [Current architecture](current-architecture.md) | What exists in `main` now |
| [Development](development.md) | Local development and verification workflow |
| [Security architecture](security-architecture.md) | Current authentication, authorization and security invariants |
| [Roadmap](../ROADMAP.md) | Authoritative 48-phase product roadmap |
| [Phase index](phases/README.md) | Current and upcoming phase status |
| [Project state](../PROJECT_STATE.md) | Current phase, blockers and continuation rules |
| [ADR index](adr/README.md) | Durable architectural decisions |

## Current state

The repository has reached **Phase 40 — End-to-End Internet Resilience Validation** on `main`. Phase 41 is now the active extension: **External Regional Validation**.

Phase 41 adds `pnpm regional:online`, an online probe that verifies the public egress IP and country reported by a trusted HTTPS regional vantage point. For Iran-specific validation, the observed probe egress must independently resolve to `IR`; the destination being tested is not evidence of Iranian egress.

The roadmap now contains **48 phases**. Phases 41–48 are the canonical post-Phase-40 extension and are documented in `ROADMAP.md`.

## Documentation policy

1. Documentation must describe code that exists on `main`, not proposed architecture presented as implemented functionality.
2. `README.md`, `ROADMAP.md`, `PROJECT_STATE.md`, and this directory must not claim different current phases.
3. Historical phase material is retained for traceability, but it is not an operational source of truth.
4. New architecture decisions belong in `docs/adr/`.
5. Phase records belong under `docs/phases/` and must state implementation status and verification status separately.
6. Generated reports, raw audit dumps and temporary verification artifacts do not belong in the canonical documentation tree.
7. A regional/geolocation result is evidence, not absolute proof of physical location; location accuracy can vary by network type and provider.
