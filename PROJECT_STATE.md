# InternetResiliencePlatform — Canonical Project State

> This file is the machine-readable human-maintained handoff point for continuing development from any account, agent, or future session.

## Current State

- **Current phase:** Phase 37 — Prometheus Integration
- **Phase status:** In progress; implementation fix committed, CI verification required
- **Next phase:** Phase 38 — Operational Diagnostics
- **Roadmap:** 40 phases total
- **Product mode:** Headless/core-first
- **UI/Desktop scope:** Removed; do not reintroduce unless explicitly requested
- **README policy:** Do not modify README.md unless explicitly requested by the user

## Phase 37 Result

Phase 37 establishes the Prometheus integration layer with:

- canonical Prometheus metric registration
- standard scrape exposition
- metric-type validation
- label-schema consistency checks
- bounded metric labels/cardinality semantics
- bridge subscription to the internal metrics bus
- default runtime metrics support

### Latest CI failure and fix

The CI `pnpm lint` job reached the telemetry package and failed TypeScript compilation in `packages/telemetry/src/prometheus.ts` because the union type `Metric` was not narrowed sufficiently for `inc`, `set`, and `observe` operations.

The fix was applied directly to `packages/telemetry/src/prometheus.ts` in commit:

`37ed4fcb6b5c14fcb8ed8c540b102e67fd14f25f`

The fix keeps runtime metric-type checks and explicitly narrows the concrete Prometheus metric before calling its type-specific operation.

## Verification Gate

Phase 37 must not be marked complete until all applicable repository gates pass, including at minimum:

```text
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm validate
```

If CI reports a new failure, fix the root cause rather than weakening or bypassing the gate.

The Turborepo warning about a missing/unparseable `pnpm-lock.yaml` must also be investigated. A clean production repository must have a valid lockfile and CI must use frozen-lockfile installation semantics.

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

### Phase 38 — Operational Diagnostics

Focus on machine-readable operational diagnostics and automation hooks. No dashboard is required.

Expected direction:

- structured diagnostic reports
- health/readiness/dependency reporting
- actionable failure classification
- correlation with telemetry and route decisions
- safe diagnostic automation hooks
- deterministic tests
- production runtime verification
- no UI implementation
