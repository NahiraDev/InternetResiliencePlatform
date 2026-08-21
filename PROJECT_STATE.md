# InternetResiliencePlatform — Canonical Project State

> This file is the machine-readable human-maintained handoff point for continuing development from any account, agent, or future session.

## Current State

- **Current phase:** Phase 38 — Operational Diagnostics
- **Phase status:** Implementation applied; repository CI/runtime verification pending
- **Next phase:** Phase 39 — Remote/Mobile Client Connectivity & Security Hardening
- **Roadmap:** 40 phases total
- **Product mode:** Headless/core-first
- **UI/Desktop scope:** Removed; do not reintroduce unless explicitly requested
- **README policy:** Do not modify README.md unless explicitly requested by the user

## Phase 37 Result

Phase 37 — Prometheus Integration is considered implemented and the user has reported that CI/CD is now passing. The previous telemetry TypeScript narrowing failure was fixed in `packages/telemetry/src/prometheus.ts`.

## Phase 38 Result

Phase 38 adds a production-oriented operational diagnostics layer:

- versioned machine-readable diagnostic report model
- deterministic healthy/degraded/unhealthy/unknown severity aggregation
- actionable failure classification and recommendations
- liveness, readiness, network, platform and metrics checks
- correlation with platform dependencies, route decision evidence and telemetry state
- safe, observational automation only
- strict non-zero exit semantics for unhealthy/degraded automation runs
- bounded HTTP probing with explicit timeouts
- deterministic unit tests
- no UI/dashboard implementation

### Phase 38 implementation

- `packages/telemetry/src/diagnostics.ts` — report model and deterministic report builder
- `packages/telemetry/src/diagnostics.test.ts` — classification/report tests
- `scripts/operational-diagnostics.mjs` — machine-readable operational diagnostics CLI
- `package.json` — `diagnostics` and `diagnostics:strict` automation hooks
- `docs/phases/phase-38.md` — scope, safety and acceptance criteria

## Verification Gate

Phase 38 must not be marked complete until all applicable repository gates pass, including at minimum:

```text
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm validate
```

Additionally, when the API runtime is available, execute:

```text
pnpm diagnostics
pnpm diagnostics:strict
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

### Phase 39 — Remote/Mobile Client Connectivity & Security Hardening

Focus on secure headless client/data-plane connectivity and production security hardening. No mobile/desktop dashboard should be introduced.
