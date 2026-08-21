# InternetResiliencePlatform — Canonical Project State

> This file is the machine-readable human-maintained handoff point for continuing development from any account, agent, or future session.

## Current State

- **Current phase:** Phase 39 — Remote/Mobile Client Connectivity & Security Hardening
- **Phase status:** Implementation applied; repository CI/runtime verification pending
- **Next phase:** Phase 40 — End-to-End Internet Resilience Validation
- **Roadmap:** 40 phases total
- **Product mode:** Headless/core-first
- **UI/Desktop scope:** Removed; do not reintroduce unless explicitly requested
- **README policy:** Do not modify README.md unless explicitly requested by the user

## Phase 38 Result

Phase 38 — Operational Diagnostics is implemented in the repository. The latest fixes completed the strict optional diagnostic typing contract. The repository still requires the canonical verification gates to be treated as the completion boundary rather than source presence alone.

Implemented Phase 38 surfaces:

- `packages/telemetry/src/diagnostics.ts` — report model and deterministic report builder
- `packages/telemetry/src/diagnostics.test.ts` — classification/report tests
- `scripts/operational-diagnostics.mjs` — machine-readable operational diagnostics CLI
- `package.json` — `diagnostics` and `diagnostics:strict` automation hooks
- `docs/phases/phase-38.md` — scope, safety and acceptance criteria

## Phase 39 Result

Phase 39 security primitives are now implemented in the reusable `@irp/auth` layer. No mobile/desktop UI was introduced.

Implemented:

- `packages/auth/src/client-security.ts` — opaque device credentials, bounded lifetime, revocation and constant-time validation
- `packages/auth/src/client-security.ts` — one-time rotating opaque refresh tokens with replay rejection and absolute-expiry preservation
- `packages/auth/src/client-security.ts` — bounded remote-client scope allow-list
- `packages/auth/src/client-security.ts` — bounded security audit log with recursive secret redaction
- `packages/auth/src/client-security.test.ts` — deterministic tests for credential lifecycle, token rotation/replay, scope validation and audit safety
- `packages/auth/src/index.ts` — public export of the Phase 39 security contract
- `docs/phases/phase-39.md` — architecture, threat/safety contract and verification gate

### Phase 39 security boundary

The reusable layer is transport-neutral and is intended to be consumed by the existing Fastify control/data plane and future Android/iOS/remote clients. It does not grant runtime mutation permissions implicitly. Credential material is never returned by audit APIs and raw bearer/secret material is not persisted by the new primitives.

## Verification Gate

Phase 39 must not be marked complete until all applicable repository gates pass, including at minimum:

```text
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm validate
```

Additionally verify the Phase 39 security failure paths when the API runtime is available:

```text
invalid device credential -> reject
expired device credential -> reject
revoked device credential -> reject
refresh-token replay -> reject
refresh rotation -> preserve original absolute expiry
disallowed remote-client scope -> reject
audit metadata -> no credential/bearer leakage
```

If CI reports a failure, fix the root cause rather than weakening or bypassing the gate. Do not advance the roadmap merely because source files exist.

## Continuation Rules

1. Read `ROADMAP.md` and this file before starting work.
2. Determine the highest phase whose acceptance criteria are genuinely complete.
3. Never assume a phase is complete merely because its source code exists; CI/runtime verification is required.
4. Resume from the current phase when its verification gate is failing.
5. Only advance `Next phase` after the current phase is verified.
6. Inspect existing implementation before creating duplicate modules or abstractions.
7. Preserve backward-compatible contracts unless the roadmap phase explicitly requires a breaking change.
8. Prefer production-grade fixes over test-only workarounds.
9. Do not add UI/dashboard/Electron/mobile UI work; clients consume the headless control/data plane.
10. Do not modify README.md unless the user explicitly asks for a README change.
11. Keep security, policy, destination-awareness, application-level verification, failover safety, auditability, and rollback as first-class requirements.
12. Never claim a phase is complete without concrete verification evidence.

## Product Objective

The core agent must autonomously:

```text
Observe → Measure → Detect → Diagnose → Decide → Policy/Safety Check
→ Apply → Verify → Monitor → Failover/Recover → Learn
```

The objective is reliable, adaptive, headless internet connectivity that can select different eligible paths per destination/service, preserve location-sensitive access where policy requires it, and recover automatically from changing network conditions.

## Next Phase Brief

### Phase 40 — End-to-End Internet Resilience Validation

Focus on proving the complete Observe→Measure→Detect→Diagnose→Decide→Policy/Safety Check→Apply→Verify→Recover loop under degraded, changing and destination-specific network conditions, using deterministic failure injection, runtime evidence and rollback verification.
