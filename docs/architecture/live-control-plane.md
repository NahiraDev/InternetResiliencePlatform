# Live Control Plane Architecture

Phase 23 makes `@irp/resilience-runtime` the transport-agnostic control-plane authority. API, CLI, daemon, and Electron-compatible consumers exchange shared runtime DTOs instead of owning independent health calculations. Live host mutation remains disabled unless policy, capability, authentication, authorization, and idempotency checks approve it.

Layers:

1. domain types in `packages/resilience-runtime/src/domain/types.ts`;
2. orchestration in `packages/resilience-runtime/src/runtime.ts`;
3. adapter/capability boundary in `packages/resilience-runtime/src/adapter-registry.ts`;
4. API transport in `apps/api/src/index.ts`;
5. CLI transport in `apps/cli/src/index.ts`;
6. daemon lifecycle in `apps/daemon/src/index.ts`;
7. observation providers in `packages/resilience-runtime/src/observation-providers.ts`;
8. stores/events/telemetry under the runtime package.

Simulation mode never mutates host state. Safe mode is reserved for non-destructive or reversible adapter work. Live mode is fail-closed by API policy in this implementation until an operator enables production capability authorization.
