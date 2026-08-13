# Phase 13 — Intelligent Routing & Path Selection Engine

Phase 13 adds `@irp/routing`, a provider-agnostic routing decision layer. It answers **which path should traffic take for a destination** and deliberately leaves **how privileged route changes are applied** to the existing Phase 10 kernel capability and dispatcher boundary.

## Reused architecture

- **Kernel / capability boundary:** `RoutingEngine.applyPlan()` calls the kernel `routing.applyRoutePlan` and `routing.rollbackRoutePlan` operations with the `network.route` capability. The generic routing domain never executes `ip`, `route`, `netstat`, shell commands, or OS-specific networking code.
- **Rule / policy layer:** policy remains external through `RoutingPolicyProvider`. Policies can allow, deny, add constraints, require provider/interface/table dimensions, or adjust candidate score without creating a second rule engine.
- **Connectivity Manager:** Phase 12 `ConnectivitySource` data is consumed as candidate input for availability, source state, provider/resource identity, health, latency, packet loss, jitter, stability, and connectivity score. The routing package does not manage connectivity resources.
- **Events and telemetry:** routing lifecycle events are published on the existing `@irp/events` bus and low-cardinality routing metrics are recorded through the existing `MetricsRegistry`.
- **Plugin architecture:** `RoutingPluginExtension` lets plugins contribute route providers, path providers, scoring factors, policy providers, and verification strategies without modifying the core selector.

## Pipeline

```text
Route Discovery
  ↓
Normalization
  ↓
Destination / Longest-Prefix Matching
  ↓
Eligibility
  ↓
Policy
  ↓
Composable Scoring
  ↓
Deterministic Selection
  ↓
Route Plan
  ↓
Kernel routing capability
```

## Domain model

`Route` is the canonical normalized model. It contains destination, prefix, gateway, interface, source, protocol, metric, logical table, IPv4/IPv6 family, scope, state, health, priority, capabilities, expiry, and metadata.

`NetworkPath` is a generalized path abstraction. Phase 13 supports direct paths and can represent VPN, proxy, tunnel, relay, overlay, multi-hop, and custom path types for future providers. Representing these types does not implement VPN/proxy/tunnel protocols.

`RouteCandidate` combines a path, its route, optional Phase 12 connectivity source, health/performance observations, policy adjustment, normalized score components, total score, eligibility, rejection reason, and explanation messages.

`RoutePlan` is inspectable before execution. It includes destination, current path, candidate paths, selected path, policy decisions, planned kernel actions, verification status, dry-run flag, and structured explanation data.

## Destination matching

The engine supports IP addresses, CIDR destinations, hostnames, service identifiers, domain profiles, network segments, and default routes as destination inputs. DNS resolution is intentionally not performed by the routing engine. IP and CIDR destinations use IPv4/IPv6-aware CIDR matching and longest-prefix precedence; only routes with the most specific matching prefix are scored, so a high-quality default route cannot override an eligible specific route.

## Eligibility and policy precedence

Eligibility is separate from scoring. A route is rejected before scoring for invalid or unsafe conditions such as unavailable connectivity source, disabled provider, unreachable gateway, unhealthy route, wrong address family, expired route, missing capability/path support, policy prohibition, manual override rejection, or flapping stabilization.

Deterministic precedence is:

1. security validation
2. manual deny/require
3. policy deny
4. address-family constraints
5. longest-prefix match
6. connectivity eligibility
7. policy preference
8. health
9. stability
10. performance
11. route metric
12. deterministic tie-breaker

## Scoring

Scoring is normalized to 0–100 and composable. Built-in factors cover health, latency, packet loss, jitter, stability, policy preference, connectivity score, and route metric. Weights are configurable through `RoutingConfig.scoringWeights`, and plugins can register additional `RoutingScoreFactor` implementations.

## Stability, failover, recovery, and transactions

Route changes are transaction-like: create a plan, apply through the kernel, verify with registered provider verification strategies, commit active path on success, and request kernel rollback on verification failure. Concurrent commits for the same destination share the same in-flight promise to prevent duplicate transitions. Hysteresis prevents switching unless the new candidate improves enough over the current candidate. Bounded transition history powers flapping detection; when flapping is detected, routing emits `routing.flapping.detected` and prefers the current stable path unless a critical failure requires failover.

`failover()` and `recover()` reuse the same policy, eligibility, scoring, planning, kernel application, and verification path. Recovery does not bypass hysteresis or policy.

## Simulation and explainability

`simulateRouting()` is deterministic and never changes real networking. It returns matched route IDs, eligible candidates, rejected candidates with reasons, policy decisions, score components, selected path, decision reason, and future-AI context including destination, current path, candidate paths, policies, and bounded transition history.

## Implemented events and metrics

Implemented events include route discovery, candidate evaluation, path selection, decision creation, transition start/success/failure, failover start/success/failure, recovery start/success, flapping detection, policy rejection, and manual override changes.

Implemented metrics include routing decision totals/duration, path switch success/failure totals, and flapping totals using the existing telemetry registry.

## Security boundaries

The routing package validates prefixes/families, filters unhealthy and prohibited candidates before selection, requires all actual route changes to pass through the kernel `network.route` capability, and supports rollback on failed verification. Unknown path types cannot execute privileged operations unless enabled in configuration and backed by kernel/provider implementations.

## Deferred work

Phase 13 does not implement DNS resolution, VPN/proxy/tunnel protocols, multipath data-plane behavior, AI recommendations, desktop/mobile UI, remote agents, fleet management, or OS-specific adapters. Those systems can consume the structured routing context and path abstractions in later roadmap phases.
