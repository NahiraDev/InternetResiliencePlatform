# Platform Model

IRP is a multi-platform network resilience product with one authoritative control model and platform-specific adapters.

## Product surfaces

```text
                    IRP Control Plane
                           │
          ┌────────────────┼────────────────┐
          │                │                │
        Web            Desktop           Mobile
          │          Linux/macOS/Win    iOS/Android
          └────────────────┼────────────────┘
                           │
                  Shared capability API
                           │
                Core / Resilience Runtime
                           │
              ┌────────────┼────────────┐
            DNS         Routing       Tunnel
              │            │             │
              └────────── Gateway / Network
```

## Authority rules

- Core and the resilience runtime own network decisions.
- The control plane owns authentication, authorization, configuration and synchronization.
- Clients own presentation, local lifecycle integration and platform-specific adapters.
- Gateway providers are behind provider-neutral contracts.
- Telemetry and audit records are produced by the authoritative runtime rather than inferred independently by UIs.

## Mobile

Mobile is a full client, not merely a remote dashboard. The shared client contract covers enrollment, state, policies, diagnostics, analytics and permitted gateway/tunnel capabilities. Native OS networking capabilities are exposed only through platform adapters and only where the operating system permits them.

## Evolution rule

New product surfaces must consume existing capability contracts. A new UI must not create a second source of truth for routing, policy, gateway selection or failover.
