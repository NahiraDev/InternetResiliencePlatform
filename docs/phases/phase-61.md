# Phase 61 — Linux Full Client

## Status

**Implementation started; repository/runtime verification required.**

Phase 61 introduces the Linux Full Client boundary without duplicating Core routing or policy intelligence. The client owns Linux process/platform integration, local diagnostics presentation and client-local policy state; safety-critical network decisions remain in the shared Core/Control Plane.

## Implemented in this phase

- `@irp/linux-client` workspace package with strict TypeScript configuration.
- Linux network diagnostics through `ip -brief address`, `ip -brief route` and `resolvectl status` using `execFile` (no shell interpolation).
- Bounded command execution with deterministic unavailable/error reporting.
- Local policy control for autonomous mode with defensive state exposure.
- Loopback-only local HTTP control surface on `127.0.0.1:17861`.
- User-facing diagnostics and autonomous-mode control UI.
- systemd service-unit contract with restart and hardening directives.
- Unit tests for policy initialization, mutation and defensive copying.

## Explicit boundaries

- No routing, DNS, tunnel, gateway or failover execution authority is introduced.
- The Linux client does not implement its own scoring, routing or policy engine.
- Local HTTP control is loopback-only by default.
- Network command execution uses argument arrays and bounded timeouts.

## Remaining acceptance evidence

1. `pnpm install --frozen-lockfile`.
2. `pnpm typecheck`.
3. `pnpm lint`.
4. `pnpm test` including Linux client tests.
5. `pnpm build`.
6. Runtime verification on a Linux host with `ip` and `resolvectl` available.
7. systemd installation/start/restart/stop verification.
8. Desktop UI/tray integration verification across supported Linux desktop environments.
9. Security review of local control surface and systemd hardening.
10. CI green before Phase 61 is marked complete.

The phase must not be represented as complete until the outstanding evidence is attached to the repository state.
