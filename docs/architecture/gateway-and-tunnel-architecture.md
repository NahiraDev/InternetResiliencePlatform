# Gateway and Tunnel Architecture

## Purpose

Gateway and tunnel capabilities are execution infrastructure for the resilience platform. They are not part of the decision engine itself.

```text
Observation
   ↓
Diagnosis / Decision
   ↓
Policy + Safety
   ↓
Path / Gateway selection
   ↓
Provider / Tunnel execution
   ↓
Verification
   ↓
Recovery / rollback
```

## Gateway

A gateway is a network execution point that can provide an egress or path capability to a client or another platform component. Its health, identity, capabilities and policy constraints must be observable by the control plane.

## Tunnel

A tunnel is a transport mechanism between endpoints. The tunnel abstraction must remain provider-neutral so that protocol-specific implementations can be added without changing the autopilot decision model.

## Provider abstraction

Providers expose capabilities through explicit contracts:

- lifecycle;
- health;
- capabilities;
- endpoint identity;
- connection state;
- cost/quality metadata;
- failure reason;
- teardown and rollback behavior.

Provider-specific secrets remain outside telemetry and general application logs.

## Safety

No gateway or tunnel should be selected solely because it exists. Selection must satisfy policy, capability, trust and health constraints. A failed activation must leave the client in a known state and must not silently disable existing connectivity safeguards.

## Multi-gateway operation

Future phases may support multiple gateways, regional federation and automatic failover. The authoritative policy and decision state remains in the control-plane/core model; clients execute bounded platform-specific actions.

## Roadmap relationship

Gateway/tunnel implementation is primarily covered by Phases 46–55. Earlier resilience-runtime and connectivity components provide the abstractions those phases extend.
