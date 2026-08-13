# Phase 12 — Multi-Source Connectivity Manager & Connection Orchestrator

Phase 12 adds `@irp/connectivity`, a provider-agnostic orchestration layer for network connectivity sources. It builds on the existing Phase 10 kernel boundary, event bus, telemetry package, plugin architecture, and Phase 6 network-intelligence health snapshots instead of adding provider-specific operating-system networking commands.

## Architecture

The manager separates responsibilities:

- **Rule / policy layer:** decides what should happen and can allow or reject a proposed transition through the manager `policy` hook.
- **Connectivity Manager:** evaluates available resources, scores candidates, applies hysteresis/cooldown/flapping safeguards, and executes safe transitions.
- **Connectivity Provider:** knows how to connect, disconnect, activate, deactivate, discover, and health-check its own resources.
- **Kernel boundary:** privileged provider implementations can be registered behind existing kernel contracts; the generic manager itself does not shell out or run platform-specific network commands.

## Provider abstraction and resources

`ConnectivityProvider` supports provider types `ethernet`, `wifi`, `cellular`, `usb-tether`, `vpn`, `proxy`, `relay`, `virtual`, and `custom`. Phase 12 only defines the abstraction and simulation provider; concrete Ethernet, Wi-Fi, VPN, proxy, relay, and tunnel implementations remain later roadmap work.

A provider may expose multiple `ConnectivityResource` records. Each resource includes provider id, resource id, provider type, optional interface name, lifecycle state, addresses, gateway, DNS servers, capabilities, health, priority, and metadata. The resource model intentionally excludes credentials and secrets.

## Lifecycle and source model

Connectivity states are explicit: `unknown`, `discovered`, `available`, `unavailable`, `connecting`, `connected`, `active`, `degraded`, `failed`, `disconnecting`, `recovering`, and `disabled`. Invalid transitions are rejected with typed errors.

A `ConnectivitySource` distinguishes availability, connected state, active state, preferred source, candidate status, failed status, and recovering status. The initial implementation supports a single active source while keeping provider/resource data models ready for future active-active and multipath work.

## Selection, scoring, and explainability

`evaluate()` is a dry-run selection API. It returns current source, available sources, healthy sources, candidate rankings, selected candidate, policy constraints, and structured reasons without changing connectivity.

Scoring is normalized to 0–100 and combines provider health, priority, latency, packet loss, jitter, stability, failure history, reliability, and activation capability. Priority is configurable and contributes to the score, but failed or unhealthy resources are rejected before activation unless a valid force override is active.

## Failover, failback, recovery, and safety

Switching is transaction-like: prepare, policy/eligibility validation, optional connect, activate, verify health, commit active source, then clean up the previous source if supported. Activation or verification failure rejects the candidate, preserves the previous active source, records failure state, and lets failover try another bounded candidate.

Failback is safe and non-immediate. It only considers the preferred source after health and eligibility checks. Hysteresis, cooldown, and flapping protection prevent oscillation. Repeated recent transitions enter stabilization mode, emit `connectivity.flapping.detected`, and suppress non-critical switching while allowing critical/manual operations.

Recovery is bounded through `recover(resourceId)`, which moves failed resources through a health verification path and updates consecutive success/failure counters, recovery attempts, and timestamps.

## Events, observability, and auditability

The manager publishes lifecycle and audit events through the existing `@irp/events` bus, including provider registration/removal, resource discovery/change, active-source changes, failover/failback/recovery start and result, flapping detection, and manual overrides. The optional existing `MetricsRegistry` records provider/resource totals, active-source changes, switch/activation/verification durations, flapping, and source health scores with low-cardinality labels.

## Manual override

`manualOverride()` supports force, prefer, disable, enable, and clear operations. Overrides are explicit, audited, and still require provider/resource existence and activation capabilities. Forced activation can bypass health threshold verification, but cannot bypass missing capabilities.

## Simulation

`SimulationConnectivityProvider` is deterministic and never touches the host network. Tests and future CLI/UI/API/debug tooling can model healthy Ethernet and Wi-Fi, failures, recovery, all-sources-down, flapping, activation failure, and verification failure.

## Security and future extension points

The generic manager has no `child_process` usage, no arbitrary executable paths, and no Linux-specific commands. Provider-specific privileged behavior belongs behind provider implementations and kernel/capability contracts. Future VPN, proxy, relay, gateway, tunnel, AI decision, Smart DNS, intelligent routing, and plugin SDK phases can register providers and consume structured evaluation context without modifying the manager core.
