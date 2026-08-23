# Network Autopilot

IRP's Network Autopilot is the closed-loop system that observes network conditions, evaluates evidence, selects an allowed action, applies it, verifies the result, and recovers when the action does not improve the connection.

## Closed loop

```text
Observe → Measure → Detect → Diagnose → Decide → Policy/Safety Check
   ↑                                                        ↓
Recover ← Rollback ← Verify ← Apply ←───────────────────────┘
```

## Evidence

Decisions should use multiple signals where available: latency, packet loss, jitter, DNS health, TLS timing, path reachability, recent stability, gateway health, and regional probe evidence. A single measurement must not be treated as proof of overall path quality.

## Safety

The Autopilot is policy-constrained. It must not invent credentials, silently broaden authorization, or bypass platform security controls. Actions that can materially change connectivity require explicit capability and policy checks.

## Recovery

Every mutating decision has a bounded verification window and a recovery path. Failed changes should be rolled back or replaced with the last known-good state when supported by the runtime.

## Product surfaces

The same decision model is exposed through the Control Plane and Full Clients. Clients present state and permitted controls; they do not implement an independent routing policy engine.
