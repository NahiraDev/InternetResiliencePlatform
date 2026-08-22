# Network Intelligence

Network intelligence converts raw connectivity observations into normalized evidence that the resilience runtime can reason about.

## Pipeline

```text
Probe / Provider
      ↓
Raw observation
      ↓
Normalization
      ↓
Health signal
      ↓
Diagnosis context
      ↓
Decision input
```

## Measurement dimensions

Depending on the available probe/provider, measurements can include latency, reachability, packet loss, DNS behavior, transport/TLS timing, HTTP success, and endpoint health.

Measurements should retain enough context to distinguish the target, protocol, timestamp, source, and failure class. A single scalar score must not erase the underlying evidence.

## Failure classification

The intelligence layer should distinguish at least:

- local/runtime failure;
- DNS resolution failure;
- transport/connectivity failure;
- TLS negotiation failure;
- HTTP/application failure;
- regional/egress difference;
- unknown or insufficient evidence.

## Decision boundary

Network intelligence provides evidence. It does not independently authorize a consequential network action. Decisioning belongs to the resilience runtime and must pass policy/safety checks.

## Verification

The same measurement model can be used after an action to determine whether the expected outcome actually occurred. Successful execution is not equivalent to recovered connectivity.

## Implementation

Primary implementation: `packages/network-intelligence`.

The resilience runtime consumes observation providers and adapters from `packages/resilience-runtime`. Tests and current project state determine which intelligence capabilities are production-integrated.
