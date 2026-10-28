# Phase 140 — API Compatibility, Migration & Deprecation Framework

## Status

**Implemented pending exact-SHA CI evidence.** Schema diffing, bump enforcement, deprecation windows and migration chains are implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Classify schema changes, enforce semantic version bumps and notice periods, and migrate payloads across versions with round-trip verification.

## Dependencies

- Phase 135 — Versioned Control-Plane API

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/control-api/compatibility.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Breaking-change classification.
- Deprecation and sunset policy with headers.
- Ordered payload migrations.

## Non-goals

- Silent breaking changes.

## Evidence map

| Criterion | Location |
| --- | --- |
| Breaking changes require a major bump. | `packages/resilience-runtime/tests/phase-135-140-control-api.test.ts` |
| Short notice is refused. | `packages/resilience-runtime/tests/phase-135-140-control-api.test.ts` |
| Missing migration paths fail loudly. | `packages/resilience-runtime/tests/phase-135-140-control-api.test.ts` |

## Acceptance criteria

1. Breaking changes require a major bump.
2. Short notice is refused.
3. Missing migration paths fail loudly.

## Verification boundary

- Package unit tests for `@irp/resilience-runtime`.
- Existing CI that runs those suites.
- No claim of live-environment, device or production validation until exact-SHA CI and runtime evidence exist.

## Rollback considerations

- The module is additive and side-effect free at import time; removing its barrel export reverts the phase.
- Nothing here mutates network state; any resulting action flows through the existing safety kernel and privileged
  mutation boundary.

## Related issues

- Tracking: open roadmap workstream
- External blockers remain in issues #254, #272, #284 and #323
