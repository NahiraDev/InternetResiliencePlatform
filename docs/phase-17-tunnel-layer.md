# Phase 17 — VPN / Proxy Abstraction & Secure Tunnel Layer

## Status

Implemented: protocol-agnostic tunnel, proxy, endpoint, provider, lifecycle, selection, simulation, recovery-action, observability, audit-safe event, kill-switch, leak-protection, and Linux platform-boundary abstractions.

Unsupported as production adapters: WireGuard, OpenVPN, SOCKS5, HTTP CONNECT, and HTTPS proxy. The repository currently has no native protocol dependencies or platform integration that would allow these to be implemented securely, so Phase 17 exposes provider contracts and explicit unsupported-provider behavior rather than faking support.

## Architecture

Phase 17 consumes Phase 11 policy constraints, Phase 12 connectivity context, Phase 13 routing context, Phase 14 resolver requirements, Phase 15 secure-DNS transport context, and Phase 16 recovery requests. It owns tunnel/provider/proxy lifecycle only; route changes remain delegated to routing/kernel layers and DNS decisions remain delegated to DNS layers.

```text
Policy -> Connectivity -> Routing -> Tunnel Selection -> Tunnel Establishment -> DNS Context -> Health -> Recovery
```

## Domain model

The `@irp/tunnel` package defines normalized `Endpoint`, `Tunnel`, `Proxy`, `TunnelConnection`, `TunnelProvider`, `TunnelProviderRegistry`, `PlatformTunnelAdapter`, `KillSwitch`, and `RecoveryTunnelActions` contracts. Credentials are represented by references such as `credentialRef`, `certificateRef`, `keyRef`, or `tokenRef`; secret values are not stored in generic tunnel objects.

## Lifecycle and safety

Tunnel states are explicit: `registered`, `configured`, `preparing`, `connecting`, `authenticating`, `establishing`, `connected`, `degraded`, `disconnecting`, `disconnected`, `failed`, `recovering`, and `destroyed`. Invalid transitions throw structured `TunnelStateConflict` errors.

Full-tunnel, split-tunnel, proxy-only, and custom routing modes are explicit. Split tunnels require included or excluded destinations. Full-tunnel activation is represented as a validated tunnel selection and connection lifecycle; route installation must still be requested through Phase 13 and privileged execution through Phase 10.

## Security and observability

Configuration validation rejects malformed endpoints, unsafe MTU values, aggressive keepalive values, missing credential references, unsupported protocols, and strict-profile tunnels without authentication and health checks. Metrics include connect attempts, successes, failures, reconnects, disconnects, and handshake duration. Event payloads are redacted to avoid leaking passwords, private keys, tokens, certificates, authorization data, credentials, or secrets.

Leak protection is reported as `protected`, `degraded`, `leakDetected`, or `unknown`; the package does not claim absolute leak prevention. Kill-switch support is an interface only; firewall operations must be implemented by platform/kernel adapters.

## Simulation

`simulateTunnelSelection`, `simulateTunnelConnection`, and `simulateFailover` are dry-run helpers. They do not create tunnels, modify routes, change DNS, alter firewall state, or expose credentials.

## Plugin and platform integration

Future plugins can implement `TunnelProvider` while declaring protocol, capabilities, supported scopes, supported routing modes, endpoints, and security requirements through the existing package/plugin ecosystem. Linux support is represented by a `PlatformTunnelAdapter` boundary; generic tunnel code does not execute shell commands or mutate OS network state.
