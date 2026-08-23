# Documentation Audit — 2026-08-23

**Status:** active reconstruction baseline
**Scope:** entire repository, with emphasis on documentation discoverability, canonical ownership, implementation traceability, and readiness for the 70-phase product plan.

## Audit rule

A document is not considered complete merely because a file exists. Every durable claim must have one canonical home and must be consistent with implementation and verification evidence.

## Repository-wide observations

The repository contains documentation in several forms: `docs/`, root governance files, package READMEs, `examples/`, `infra/*/README.md`, `.github/AGENTS.md`, workflow files, and phase-specific tests. The recursive repository tree confirms these are all part of the current `main` tree.

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
| Security | `docs/security/` | CANONICAL |
| Network | `docs/network/` | EXPAND |
| Observability | `docs/observability.md` + operations observability | CONSOLIDATE boundary |
| Reference | `docs/reference/` | EXPAND |
| Decisions | `docs/adr/` | KEEP / reconcile historical names |
| Phase evidence | `docs/phases/` + `docs/audits/phase-history-evidence-matrix.md` | RECONSTRUCT 00–44 |
| Tests policy | `docs/testing/` | EXPAND |

## Legacy / duplicate surfaces resolved

### Mobile

The obsolete root mobile-client document has been removed. Its durable product model is now represented by `docs/concepts/full-client-model.md` and the client onboarding documentation. Mobile is a first-class Full Client under the 70-phase product plan; platform-specific capabilities remain constrained by native OS permissions and networking APIs.

### Security

The obsolete root security-architecture document has been removed. The canonical security architecture is now `docs/security/security-architecture.md`. The canonical document defines authentication/authorization boundaries, remote-client security, network-probe safety, secret handling and runtime/supply-chain requirements.

## Required documentation domains before Phase 45

1. Client and device lifecycle: enrollment, identity, capabilities, revocation, reconnect, secure storage.
2. Gateway/tunnel/provider contracts: roles, lifecycle, trust, health, failover and rollback.
3. API contract catalog: authentication, devices, runtime, probes, analytics, gateway/tunnel and future control-plane resources.
4. Operational procedures: deployment, upgrade, rollback, backup/restore, incident response and diagnostics.
5. Security model: threat model, trust boundaries, credential lifecycle, plugin/runtime security, privacy and abuse controls.
6. Phase traceability: reconstruct historical phases from code/tests/migrations rather than inventing evidence.
7. Documentation CI: broken-link detection, stale roadmap detection, orphan detection, canonical-source checks and phase-record checks.

## Phase-history reconstruction policy

Do not fabricate Phase 01–38 records. The new [`phase-history-evidence-matrix.md`](phase-history-evidence-matrix.md) records verified historical evidence and explicitly distinguishes historical evidence from current completion. Historical phase numbering drift is a known issue: old implementation phase numbers do not map one-to-one to the current 70-phase product contract. Canonical records for 01–38 will only be created after each implementation cluster is mapped to the current contract, tests, migrations/configuration, ADRs, merged changes and verification evidence.

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
