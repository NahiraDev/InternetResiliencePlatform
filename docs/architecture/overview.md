# Architecture Overview

This is the entry point for the architecture documentation.

IRP separates observation, intelligence, decisioning, policy, action, verification, persistence, and telemetry so that network automation remains explainable and bounded.

## Major layers

```text
Clients
  ↓
API / Application Services
  ↓
Domain & Runtime Services
  ↓
Network Intelligence
  ↓
Decision / Policy
  ↓
Recovery / Providers
  ↓
Verification
  ↓
Persistence + Telemetry
```

## Read next

- [System architecture](system-architecture.md)
- [Network intelligence](network-intelligence.md)
- [Control loop](../concepts/control-loop.md)
- [Connectivity](connectivity.md)
- [DNS](dns.md)
- [Routing](routing.md)
- [Failover](failover.md)
- [Security](../security/overview.md)
- [Observability](../operations/observability.md)

## Implementation status

Architecture documentation distinguishes implemented behavior from planned behavior. The repository code, tests, and `PROJECT_STATE.md` remain authoritative for current capability status.
