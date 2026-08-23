# IRP Product Architecture

## Purpose

This document records the product-level architecture introduced by the 70-phase roadmap. It reconciles the original headless/core-first design with the new requirement for a complete cross-platform product.

## Layering

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
Measurement → Intelligence → Policy → Decision → Apply → Verify → Recover
```

### Core

The Core remains authoritative for:

- measurement and evidence normalization;
- destination/service classification;
- policy and safety evaluation;
- candidate scoring;
- route/tunnel decisions;
- verification;
- failover and rollback;
- learning and analytics inputs.

### Control Plane

The Control Plane provides versioned capabilities for:

- authentication and device identity;
- configuration and policy;
- status and diagnostics;
- analytics;
- gateway/tunnel inventory;
- audit and notifications;
- controlled commands.

The API is not allowed to silently bypass Core policy or safety gates.

## Full Client contract

Linux, macOS, Windows, iOS and Android clients implement the same capability model. They may have different native adapters, but they must not implement independent route-selection algorithms.

A capability is modeled conceptually as:

```text
Capability
├── read state
├── request decision
├── request controlled action
├── observe result
└── receive audit/event outcome
```

Authorization is enforced server-side and, where relevant, locally by the platform adapter.

## Mobile

Mobile is a Full Client. Required areas are:

- secure enrollment and session lifecycle;
- network/runtime status;
- analytics;
- service and workspace policies;
- gateway/tunnel state;
- controlled Autopilot actions;
- diagnostics;
- notifications;
- multi-device synchronization.

System-level networking is implemented through official platform capabilities and isolated behind adapters. The shared Core remains platform-neutral.

## Gateway and tunnel model

```text
Gateway
├── identity
├── ownership
├── capabilities
├── health
├── capacity
├── policy eligibility
└── lifecycle

Tunnel
├── provider
├── establish
├── verify
├── maintain
├── rotate
├── reconnect
└── teardown
```

Providers are plugins/adapters. The Core decides whether a provider is eligible; a provider cannot self-authorize itself into use.

## Data and analytics

Analytics consumes normalized historical and federated evidence. It is bounded and explainable. It must preserve provenance and explicitly represent missing/stale/insufficient data.

Analytics does not directly mutate network state.

## Security boundaries

- Device credentials and refresh tokens are secrets.
- Probe private keys never leave the probe.
- Analytics never exposes raw request payloads or credentials.
- Gateway secrets are isolated from UI/API read models.
- Every privileged action is authorized, audited and observable.
- Every autonomous network mutation has a safety policy, verification step and rollback/recovery path.

## Product surfaces

| Surface | Role |
| --- | --- |
| Core Agent | Autonomous network intelligence and execution |
| Gateway | Managed network provider |
| Probe | Independent evidence source |
| Web Control Center | Full administrative/control UI |
| Linux/macOS/Windows | Full desktop clients |
| iOS/Android | Full mobile clients |
| CLI/API | Automation and operator interfaces |

## Release strategy

The 70 phases are sequential only where dependency requires it. Each phase has an independent acceptance gate, and later product tracks cannot declare the overall product production-ready until their dependencies and cross-platform contracts are verified.
