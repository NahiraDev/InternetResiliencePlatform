# Documentation Audit — 2026-08-23

**Status:** active reconstruction baseline
**Scope:** entire repository, with emphasis on documentation discoverability, canonical ownership, implementation traceability, and readiness for the 70-phase product plan.

## Audit rule

A document is not considered complete merely because a file exists. Every durable claim must have one canonical home and must be consistent with implementation and verification evidence.

## Repository-wide observations

The repository contains documentation in several forms: `docs/`, root governance files, package READMEs, `examples/`, `infra/*/README.md`, `.github/AGENTS.md`, workflow files, and phase-specific tests. The recursive repository tree confirms these are all part of the current `main` tree. fileciteturn157file0

## Canonical documentation domains

| Domain | Canonical home | Current assessment |
| --- | --- | --- |
| User entry point | `docs/README.md` | KEEP / expand |
| Concepts | `docs/concepts/` | KEEP / expand |
| Architecture | `docs/architecture/` | KEEP / reconcile |
| API | `docs/api/` | EXPAND |
| Getting started | `docs/getting-started/` | EXPAND |
| Guides | `docs/guides/` | EXPAND |
| Operations | `docs/operations/` | EXPAND |
| Security | `docs/security/` | RECONCILE legacy root document |
| Network | `docs/network/` | EXPAND |
| Observability | `docs/observability.md` + operations observability | CONSOLIDATE boundary |
| Reference | `docs/reference/` | EXPAND |
| Decisions | `docs/adr/` | KEEP / reconcile historical names |
| Phase evidence | `docs/phases/` | RECONSTRUCT 00–44 |
| Tests policy | `docs/testing/` | EXPAND |

## Legacy / duplicate surfaces found

### Mobile

`docs/mobile-client.md` describes the Phase-43-era remote-client model and explicitly says native iOS/Android is not part of the current roadmap. That statement is stale relative to the 70-phase product model. Its durable material must live under the client concept/getting-started documentation, not as an orphan root document. fileciteturn159file0

### Security

`docs/security-architecture.md` contains valuable security material but duplicates the newer `docs/security/` tree. It should be merged into the canonical security documentation and then removed from the root navigation. fileciteturn160file0

## Required documentation domains before Phase 45

1. Client and device lifecycle: enrollment, identity, capabilities, revocation, reconnect, secure storage.
2. Gateway/tunnel/provider contracts: roles, lifecycle, trust, health, failover and rollback.
3. API contract catalog: authentication, devices, runtime, probes, analytics, gateway/tunnel and future control-plane resources.
4. Operational procedures: deployment, upgrade, rollback, backup/restore, incident response and diagnostics.
5. Security model: threat model, trust boundaries, credential lifecycle, plugin/runtime security, privacy and abuse controls.
6. Phase traceability: reconstruct historical phases from code/tests/migrations rather than inventing evidence.
7. Documentation CI: broken-link detection, stale roadmap detection, orphan detection, canonical-source checks and phase-record checks.

## Phase-history reconstruction policy

Do not fabricate Phase 01–38 records. Where implementation evidence exists in source, tests, migrations, ADRs or commits, reconstruct a concise historical record. Where evidence is insufficient, mark the phase as `historical-evidence-incomplete` rather than claiming completion.

Future Phase 45–70 documents are specifications until implementation and verification evidence exists.

## Completion gate for this audit

The documentation migration is complete only when:

- `docs/README.md` is the single navigation entry point;
- every documentation domain has one canonical location;
- legacy duplicates are either merged or explicitly marked historical;
- all internal links resolve;
- phase status matches implementation evidence;
- root README, ROADMAP and PROJECT_STATE agree on current state;
- client/gateway/API/security/operations domains have durable contracts;
- documentation checks run in CI.
