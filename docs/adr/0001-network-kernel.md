# ADR 0001: Network Kernel as Platform Boundary

## Status

Accepted

## Decision

All subsystems communicate through the kernel runtime and its public contracts. Direct subsystem-to-subsystem implementation imports are not permitted for future plugin integrations.

## Consequences

The platform gains stable extension points, capability-based security, event-driven observability, and long-term plugin compatibility.
