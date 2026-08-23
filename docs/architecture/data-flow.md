# Data and Control Flow

This document defines the stable flow between observation, decision, execution and user-facing surfaces.

## Evidence flow

```text
Probe / OS / Gateway signals
          ↓
     Measurements
          ↓
 Detection + Diagnosis
          ↓
 Decision candidate
          ↓
 Policy + Safety checks
          ↓
     Authorized action
          ↓
 Verification
          ↓
 Telemetry + Audit + State
```

## Control flow

1. A client or scheduler requests status or a permitted action.
2. The control plane authenticates the actor and authorizes the capability.
3. The authoritative runtime evaluates current state and policy.
4. The selected adapter performs the bounded operation.
5. Verification confirms the resulting state.
6. State, telemetry and audit evidence are persisted or emitted according to the subsystem contract.

## Failure handling

Failure is part of the normal control flow. Every consequential operation should define its timeout, retry policy, recovery behavior and observable terminal state. If an operation cannot be safely verified, the system must not claim success.

## Separation of concerns

- Evidence is not configuration.
- Diagnosis is not action.
- A requested action is not proof that the action succeeded.
- UI state is not authoritative network state.
- Historical analytics are not live control state.
