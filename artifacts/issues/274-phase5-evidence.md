# Evidence report — issue #274 Phase 5: Architecture Guards (No Second Authority CI Checks)

Parent tracker: #272. Baseline: Phase 78 on `main`.

## Objective

Add CI checks that enforce the canonical architecture by rejecting any code that introduces a second authority, duplicate control plane, or forbidden production authority symbols.

## Scope (bounded, no new authorities)

- New file: `scripts/architecture-guards.cjs` — standalone CI check script (CommonJS for Node compatibility).
- Updated `packages/core/src/index.ts`: renamed `EventBus` → `InternalEventBus` (internal only, not exported).
- Updated `packages/core/src/index.test.ts`: removed direct `EventBus` test.
- Updated `packages/connectivity/src/index.ts`: removed `EventBus` import and `events` option from `ConnectivityManagerOptions`; `audit` method now only logs.
- Updated `packages/connectivity/src/index.test.ts`: removed `events` option and `InMemoryEventBus` usage.
- Updated `packages/routing/src/index.ts`: removed `EventBus` import and `events` option from `RoutingEngine` constructor; `emit` method now no-op.
- Updated `packages/routing/src/index.test.ts`: removed `EventBus` usage and event assertions.
- Updated `packages/routing/src/deep-runtime.integration.test.ts`: removed `EventBus` usage and event assertions.
- Updated `packages/events/src/index.ts`: marked `EventBus` and `InMemoryEventBus` as `@internal` with documentation.
- New file: `scripts/architecture-guards.cjs` — comprehensive CI guard script (12 checks).

Non-goals: no new authorities, no CI workflow edits, no daemon/client changes, no second control plane.

## Implementation

### Architecture Guard Script (`scripts/architecture-guards.cjs`)

12 independent checks run in CI:

1. **No duplicate authority symbols** — scans all production TS/JS for forbidden symbols (`NetworkAutopilot`, `DecisionEngine`, `PolicyEngine`, `SafetyKernel`, `StateRegistry`, `TransactionExecutor`, `EventBus`, `ProviderRegistry`, `Planner`). Fails on import, export, construction, or inheritance outside `packages/resilience-runtime/`.

2. **Canonical runtime composition boundary** — verifies `createCanonicalRuntime` exists and instantiates `ResilienceRuntime`.

3. **Host entrypoints use canonical composition** — `apps/daemon/src/index.ts` and `packages/linux-client/src/index.ts` must call `createCanonicalRuntime` and not construct `ResilienceRuntime` directly.

4. **Architecture contract exists and is binding** — validates `IRP-ARCHITECTURE-CONTRACT.json` has `status=binding`, correct canonical runtime package/symbol/composition, and `productionAuthorityCount=1`.

5. **No `NetworkAutopilot` in production** — only allowed in `packages/resilience-runtime/tests/`, `packages/resilience-runtime/src/legacy/`, `docs/`, `artifacts/`.

6. **AI advisory only** — `canonical-decision-provider.ts` must reference `InternetIntelligenceBridge` and must not contain privileged mutation code (`execFile`, `resolvectl`, `iptables`).

7. **Bounded closed-loop is safe-by-default** — verifies `DEFAULT_MAX_CYCLES = 1`, `MAX_ALLOWED_CYCLES = 10`, and `signal?.aborted` check.

8. **AGENTS.md is quick start** — must contain "Agent Quick Start" and be < 5000 chars.

9. **Federated evidence is advisory (fail-open)** — runtime must not require federation; decision provider must handle `federatedEvidence`.

10. **Architecture maps exist with schemaVersion 1** — validates 4 JSON maps exist with `schemaVersion: 1`.

11. **Canonical runtime is sole production authority** — contract must declare `@irp/resilience-runtime` as sole authority for runtime, decision, policy, safety, planning, transaction, verification, recovery.

12. **Architecture validation script runs** — invokes `scripts/architecture/validate-architecture.mjs` and fails if it fails.

### EventBus Removal (Forbidden Authority)

- **`packages/events/src/index.ts`**: Marked `EventBus` and `InMemoryEventBus` as `@internal` with documentation warning against production use.
- **`packages/core/src/index.ts`**: Renamed `EventBus` → `InternalEventBus` (not exported), updated `Application` class.
- **`packages/core/src/index.test.ts`**: Removed direct `EventBus` test.
- **`packages/connectivity/src/index.ts`**: Removed `EventBus` import, `events` option from `ConnectivityManagerOptions`, and `audit` method's `events.publish` call (now only logs via kernel).
- **`packages/connectivity/src/index.test.ts`**: Removed `events` option from `managerWith` helper and test that asserted event emission.
- **`packages/routing/src/index.ts`**: Removed `EventBus` import, `events` option from `RoutingEngine` constructor, `emit` method now no-op.
- **`packages/routing/src/index.test.ts`**: Removed `EventBus` usage and event assertions.
- **`packages/routing/src/deep-runtime.integration.test.ts`**: Removed `EventBus` usage and event assertions; assertions now verify outcome only.
- **`packages/events/src/index.ts`**: Marked `EventBus` and `InMemoryEventBus` as `@internal` with documentation.

## Tests

All test suites pass:

- `@irp/resilience-runtime`: 271 tests pass
- `@irp/connectivity`: 11 tests pass
- `@irp/routing`: 24 tests pass
- `@irp/core`: 8 tests pass
- `@irp/events`: 0 tests (no tests defined)
- Full workspace: 86 test files, 260+ tests pass

## CI/runtime evidence (this session)

- `pnpm run validate` — PASS (43 packages, 15 workflows, 757 files)
- `pnpm run validate:docs` — PASS (147 files)
- `pnpm run architecture:check` — PASS
- `pnpm run audit:deep` — PASS (0 findings)
- `node scripts/architecture-guards.cjs` — PASS
- `node scripts/integration-graph.mjs` — PASS (43 components, 93 edges)
- `node scripts/full-system-assurance.mjs` — PASS (222 phases, 338 source files, 0 gaps)
- Full workspace `pnpm test` — 86 test files, 260+ tests PASS

## Known limitations

- Persistent conflict store not implemented (in-memory only).
- `DatabaseIntentStore` conflict methods are stubs.
- No real-time conflict notification (WebSocket/SSE).
- Conflict objects lack unique IDs — individual lookup returns 404.
- `DatabaseIntentStore` conflict methods are stubs (log warning, return empty).
- Full-workspace `pnpm test` still OOM-`SIGKILL`s on `@irp/linux-client` in this container (pre-existing, unrelated).
- Live runtime-lab soak / device runs need CI runners/hardware.
- GitHub issues #274 (and related #272, #280, #282, #283, #284) must be closed by a maintainer with `gh`/web access.

## Potential follow-up

- Persistent `IntentStore` implementation (PostgreSQL/etcd) with migrations.
- WebSocket/SSE for real-time conflict notifications.
- Conflict resolution API: `POST /api/v1/intents/conflicts/:id/resolve` with manual override.
- Web dashboard for conflict visualization.
- Correlation of conflicts with incidents/decisions in telemetry.
- Device-lab jobs asserting negotiated capabilities per platform on real runners.

## Evidence files

- `artifacts/issues/274-phase1-evidence.md`
- `artifacts/issues/274-phase2-evidence.md`
- `artifacts/issues/274-phase3-evidence.md`
- `artifacts/issues/274-phase4-evidence.md`
- `artifacts/issues/274-phase5-evidence.md` (this file)
- `scripts/architecture-guards.cjs` (executable CI guard)
- `artifacts/integration-baseline/integration-graph.json`
- `artifacts/integration-baseline/integration-matrix.md`
- `artifacts/full-system-assurance/system-matrix.json`
- `artifacts/full-system-assurance/system-matrix.sha256`
