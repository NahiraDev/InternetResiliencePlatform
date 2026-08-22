# Failover Architecture

Failover is the controlled transition from an unhealthy connectivity path to an alternative supported path.

## Lifecycle

```text
Detect degradation
      ↓
Diagnose
      ↓
Evaluate candidates
      ↓
Policy / safety gate
      ↓
Apply bounded transition
      ↓
Verify
   ↙     ↘
Success  Failure
  ↓        ↓
Stable   Rollback / stop
```

## Candidate selection

Failover should use measured evidence rather than static preference alone. Candidate evaluation may consider reachability, latency, loss, DNS behavior, provider health, recent failures, cooldowns, and policy constraints.

## Safety

Repeated failures must not create an uncontrolled retry loop. Circuit breakers, cooldowns, bounded action counts, and explicit recovery limits protect the system from oscillation.

## Verification

A failover is not complete until the new path is independently verified. If verification fails, the runtime should follow its configured rollback or stop policy rather than escalating indefinitely.

## Implementation status

The current failover package and resilience-runtime implementation determine which providers and recovery transitions are available on `main`.
