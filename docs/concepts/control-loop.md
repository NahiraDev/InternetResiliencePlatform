# Network Autopilot Control Loop

The target resilience model is a closed loop:

```text
Observe
  ↓
Measure
  ↓
Detect
  ↓
Diagnose
  ↓
Decide
  ↓
Policy / Safety Check
  ↓
Plan
  ↓
Apply
  ↓
Verify
  ↓
Success → Continue
  └─ Failure → Rollback / Recovery → Telemetry
```

## Responsibilities

### Observe
Collect current system and network signals without changing state.

### Measure
Run bounded probes and normalize latency, loss, DNS, transport, TLS, HTTP, and related measurements.

### Detect
Determine whether the current state is healthy, degrading, critical, or failed.

### Diagnose
Identify the most likely failure domain from available evidence rather than treating every error as an Internet-wide outage.

### Decide
Select an authorized response using deterministic local decision logic and current state.

### Policy and safety
Check capabilities, authorization, risk, cooldowns, circuit breakers, and action constraints before any consequential mutation.

### Plan and apply
Execute a typed, bounded action through a supported provider or recovery mechanism. Arbitrary command execution is not the control-loop abstraction.

### Verify
Independently measure the resulting state. Successful command execution is not sufficient evidence of recovery.

### Rollback and recovery
If verification fails, stop escalation where appropriate, roll back supported changes, and record the outcome.

## Design rule

Observation endpoints must remain safe observation surfaces. Autonomous mutation requires explicit implementation and verification evidence.
