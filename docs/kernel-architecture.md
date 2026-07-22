# Kernel Architecture

Phase 10 introduces `@irp/kernel` as the single execution point for DNS, VPN, proxy, routing, plugins, AI decisions, monitoring, security, telemetry, and workflows. Subsystems register contracts with the runtime and are invoked only through `KernelRuntime.execute`, which routes operations through the internal message bus, middleware, capability checks, metrics, and registry.

## Runtime

The runtime owns the kernel context, registry, DI container, message bus, resource manager, feature flags, configuration store, workflow engine, lifecycle state, and performance counters.

## Public SDK Boundary

Plugin and application integrations import public kernel types and helpers through `@platform/sdk`. Internal packages remain implementation details.
