# Product Architecture

## Status

**Canonical product architecture.** This document defines the cross-platform product model. It does not claim that every planned surface is implemented.

## Product model

```text
Platform-native adapters
        |
        v
Full Clients / Web Control Center
        |
        v
Versioned Control & Capability API
        |
        +-----------------------------+
        |                             |
        v                             v
IRP Core / Agent                 Gateway / Probe Services
        |
        v
Measure -> Diagnose -> Decide -> Policy/Safety -> Apply -> Verify -> Recover
```

## Core authority

The Core remains authoritative for measurement normalization, destination classification, policy and safety evaluation, candidate scoring, route/tunnel decisions, verification, failover, rollback, and learning inputs.

Client applications must not implement independent routing, policy, safety, scoring, failover, or tunnel-selection algorithms.

## Control plane

The Control Plane exposes versioned capabilities for authentication, device identity, configuration, policy, status, diagnostics, analytics, gateway/tunnel inventory, audit, notifications, and controlled commands.

API and UI layers must not bypass Core policy or safety gates.

## Full clients

Linux, macOS, Windows, iOS, and Android are product clients over shared capability contracts. Native adapters translate platform-specific facilities without creating platform-specific decision engines.

Common capabilities, subject to platform permissions, include enrollment, authentication, device/session state, network health, analytics, policies, service/workspace profiles, gateway/tunnel state, Autopilot state, diagnostics, notifications, and synchronized configuration.

## Mobile

Mobile is a **Full Client**, not a dashboard-only client. System networking is implemented through official platform APIs and isolated behind adapters. Unsupported OS capabilities must be reported explicitly rather than silently simulated.

## Gateway and tunnel model

A gateway is an authorized network endpoint managed by IRP. A tunnel provider implements a common lifecycle:

```text
establish -> verify -> maintain -> rotate -> reconnect -> teardown
```

Providers are adapters/plugins. Eligibility requires authentication, capability checks, health verification, policy evaluation, and independent egress/service evidence. Geographic IP alone is never treated as proof of service availability.

## Security boundaries

- Device credentials and refresh tokens are secrets.
- Probe private keys never leave the probe.
- Gateway secrets are isolated from UI/API read models.
- Privileged actions are authorized, audited, and observable.
- Autonomous network mutations require safety policy, verification, and rollback/recovery.

## Product surfaces

| Surface | Role |
| --- | --- |
| Core Agent | Autonomous network intelligence and execution |
| Gateway | Managed authorized network endpoint |
| Probe | Independent evidence source |
| Web Control Center | Administrative and control UI |
| Linux/macOS/Windows | Full desktop clients |
| iOS/Android | Full mobile clients |
| CLI/API | Automation and operator interfaces |

See [`current-architecture.md`](../current-architecture.md) and the detailed subsystem documents in this directory for implementation-specific architecture.
