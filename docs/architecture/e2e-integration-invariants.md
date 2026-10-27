# E2E Integration Invariants

This repository treats end-to-end integration as a first-class implementation requirement, not as a synonym for successful package builds or import checks.

## Non-negotiable invariants

1. `@irp/resilience-runtime` is the canonical control-loop authority.
2. `@irp/internet-intelligence-agent` is wired into the canonical decision boundary. Agent output is advisory and cannot bypass policy, capability checks, security validation, execution, verification, or recovery.
3. Runtime observations in a real client/daemon path must originate from the canonical network measurement layer (`@irp/network`) rather than only from command-existence probes.
4. Live DNS mutation must cross the canonical runtime adapter and reach an OS resolver control operation. A DNS provider being present in a registry is not live integration evidence.
5. Connectivity and routing mutations must cross the canonical runtime control plane. Deterministic adapters are not production evidence.
6. Recovery must delegate to `@irp/failover` where that domain owns recovery behavior. A result with `delegatedTo: failover` is invalid evidence unless the failover engine was actually invoked.
7. Plugin packages are considered integrated only when the runtime can install, validate, load, initialize, and activate the canonical built-in plugin set through `@irp/plugin-manager` and `@irp/plugin-runtime`.
8. Tunnel packages are not considered integrated merely because providers compile. A configured tunnel provider must expose a real lifecycle path before tunnel capability can be advertised as live.
9. Workspace dependency graphs and package import tests are structural checks only. They must never be presented as behavioral E2E evidence.
10. Production certification requires real-environment evidence bound to the tested commit and artifact. Missing real-environment evidence is fail-closed.

## Closed-loop contract

Every production-capable execution path must be traceable as:

`observe -> measure -> detect -> diagnose -> decide -> policy -> apply -> verify -> recover -> telemetry`

The path must preserve correlation identifiers, decision evidence, policy state, execution result, verification result, recovery result, and telemetry.

## Current composition rule

New packages must either be wired into an existing production path with a concrete consumer or explicitly marked as a boundary/optional capability. Adding a package without a consumer does not advance E2E completion.
