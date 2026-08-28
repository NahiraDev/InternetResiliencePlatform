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
Security evidence verification
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

Phase 53 introduces the canonical `MultiGatewayFailover` coordinator in `@irp/gateway-registry`. It consumes the Phase 51 `selectGateway(...)` contract for deterministic candidate eligibility and delegates the actual switch to an executor owned by the caller's tunnel/platform layer.

The failover coordinator provides:

- serialized failover operations;
- explicit current-gateway health gating;
- bounded deterministic candidate attempts;
- quarantine/cooldown for failed targets;
- mandatory post-switch health verification;
- failure/exhaustion telemetry;
- no direct route/DNS/platform mutation.

This preserves the domain boundary: `@irp/gateway-registry` decides which gateway is eligible to attempt, while `@irp/tunnel` and platform adapters own how a tunnel is actually established, disconnected, verified or recovered.

## Fleet operations

Phase 54 adds `InMemoryGatewayFleetManager` as the provider-neutral fleet-control boundary. It builds on the canonical `GatewayRegistry` rather than duplicating gateway inventory.

Fleet state covers:

- provisioning metadata and configuration version;
- desired lifecycle (`active`, `draining`, `disabled`);
- bounded capacity limits, allocation and reservations;
- explicit maintenance windows;
- upgrade intent and terminal outcome tracking;
- operational telemetry.

Fleet operations are metadata/control-plane operations. They do not create cloud instances, mutate routes, create tunnels, or execute provider-specific upgrades. Those actions remain external adapters. This keeps provisioning, tunnel execution and safety-critical switching separately testable and auditable.

Retirement is authoritative in the registry: fleet mutations re-check canonical lifecycle state so an out-of-band retirement cannot be undone by a stale fleet record.

## Gateway security and supply-chain hardening

Phase 55 adds `GatewaySecurityVerifier` as the canonical verification boundary for gateway identity and gateway artifact evidence. It is intentionally side-effect free and does not replace the gateway registry trust state.

Security evidence is accepted only when:

- the Ed25519 signer is present in the trusted public-key set and has not been revoked;
- the signed gateway identity matches the canonical gateway ID and provider policy;
- issued/expiry timestamps satisfy bounded freshness and clock-skew rules;
- the supplied gateway artifact hashes to the signed SHA-256 digest;
- artifact and gateway identity evidence use the same trusted signer for the assessment;
- malformed or tampered evidence fails closed.

The verifier never stores private keys, credentials or artifact contents and never mutates routes, DNS, tunnel state or gateway lifecycle/trust. Security telemetry is deliberately limited to gateway ID, timestamp and a bounded reason. Provider adapters remain responsible for obtaining evidence, while higher-level policy decides whether a verified assessment is sufficient for activation.

## Roadmap relationship

Gateway/tunnel implementation is primarily covered by Phases 46–55. Earlier resilience-runtime and connectivity components provide the abstractions those phases extend.
