# Network Architecture

Network documentation describes how IRP observes and reasons about connectivity without conflating measurement with network mutation.

## Current structure

- Network measurements and health signals are produced by the network intelligence layer.
- DNS, transport, HTTP, and related probes provide evidence for diagnosis.
- Connectivity and recovery abstractions define bounded mechanisms that can be evaluated by policy.
- Routing, DNS mutation, tunnel activation, and similar consequential operations require explicit capability, policy, execution, and verification support.

## Boundaries

A failed probe does not by itself identify the root cause. Diagnostics should distinguish local runtime failure, DNS failure, transport failure, TLS failure, application failure, and regional/egress differences.

## Documentation status

Detailed network subsystem documents should be added here only when they describe a stable, implemented contract. Historical phase reports belong under `docs/phases/`.

See:

- [Network intelligence](../architecture/network-intelligence.md)
- [Autopilot control loop](../concepts/control-loop.md)
- [Architecture overview](../architecture/overview.md)
- [Regional validation](../regional-validation.md)
