# Phase 62 — macOS Full Client

## Status

**Implementation in progress; final verification evidence required.**

Phase 62 adds the macOS Full Client boundary without duplicating Core routing, scoring or policy authority. The client owns macOS process/platform integration, local diagnostics presentation and client-local policy state. Safety-critical network decisions remain in shared Core/Control Plane services.

## Implemented

- `@irp/macos-client` workspace package with strict TypeScript configuration.
- macOS network diagnostics through `ifconfig`, `route -n get default` and `scutil --dns` using `execFile` argument arrays.
- Deterministic unsupported-platform behavior for non-macOS CI hosts.
- Bounded command execution with explicit unavailable/error reporting.
- Local autonomous-mode policy state with defensive reads.
- Loopback-only local HTTP control surface on `127.0.0.1:17862`.
- Health and policy JSON endpoints.
- User-facing diagnostics page and autonomous-mode control.
- `launchd` background lifecycle contract with restart/keep-alive behavior.
- Unit coverage for policy initialization, mutation/defensive copying and platform gating.

## Explicit boundaries

- No routing, DNS, gateway, tunnel or failover execution authority is introduced.
- No privileged macOS network mutation is performed by the client layer.
- Browser/UI code does not become a network-policy engine.
- Local control remains loopback-only by default.
- OS command execution uses fixed executable paths/argument arrays and bounded timeouts.

## Acceptance criteria

1. `pnpm install --frozen-lockfile` passes with the Phase 62 workspace importer present.
2. `pnpm typecheck` passes including `@irp/macos-client`.
3. `pnpm lint` passes.
4. `pnpm test` passes including all macOS client tests.
5. `pnpm build` passes.
6. Linux CI deterministically exercises the unsupported-platform path without false green runtime claims.
7. A real macOS host can execute diagnostics using `ifconfig`, `route` and `scutil`.
8. Loopback server binds only to `127.0.0.1:17862`.
9. launchd installation/start/restart/stop behavior is verified on macOS.
10. Security review covers local HTTP control, process execution and lifecycle privileges.
11. Relevant CI/runtime verification is green.

## Verification boundary

The repository must not mark Phase 62 complete until the macOS-specific items that cannot execute on Linux are represented as explicit pending evidence rather than silently skipped.
