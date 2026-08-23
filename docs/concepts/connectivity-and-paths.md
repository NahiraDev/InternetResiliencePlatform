# Connectivity and Paths

IRP models connectivity as observable network paths rather than as a single assumed route.

A path is evaluated through the available network evidence: interface and gateway reachability, DNS resolution, transport connectivity, latency, packet loss, and higher-level protocol health. Multiple candidate paths may coexist and their measurements can change over time.

## Path principles

- A path is an evidence-backed connectivity option, not a guarantee of service availability.
- Measurements are time-bounded and should be evaluated with their observation time and source.
- Path quality and policy compliance are separate decisions.
- Failover and routing components may consume path decisions, but measurement layers should not mutate routing state merely to report observations.

## Relationship to resilience

The resilience runtime can compare candidate paths and select an appropriate action according to policy. Network identity, destination identity, and other assurance signals remain separate evidence dimensions.

Implementation details belong in `docs/architecture/` and `docs/network/`.
