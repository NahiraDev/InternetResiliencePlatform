# Phase 18 — Network Security, Traffic Protection & Leak Prevention Layer

Phase 18 is implemented in `@irp/security` as the validation and enforcement coordination layer for network leak prevention. It does not select connectivity, routes, DNS resolvers, DNS transports, tunnels, or recovery strategies. Instead it consumes policy and normalized observations from Phases 11–17 and decides whether the observed network behavior is compliant.

## Implemented architecture

```text
Phase 11 policy
  -> ExpectedNetworkState
Phase 12 connectivity + Phase 13 routing + Phase 14 DNS + Phase 15 DNS transport + Phase 17 tunnel state
  -> ObservedNetworkState
ExpectedNetworkState + ObservedNetworkState
  -> deterministic compliance evaluation
  -> ProtectionValidationResult + SecurityDecision + remediation requests
```

The layer explicitly separates intended state (`ExpectedNetworkState`) from actual observations (`ObservedNetworkState`). Validation is authoritative only after route, DNS, tunnel, IPv4/IPv6, and kill-switch evidence has been compared. A system with an IPv4-safe path and an IPv6 direct bypass is therefore reported as a leak instead of protected.

## Security state machine

The `NetworkSecurityStateMachine` supports deterministic transitions across:

- `unknown`
- `evaluating`
- `protected`
- `degraded`
- `leakDetected`
- `violation`
- `blocked`
- `recovering`
- `unprotected`
- `failed`

Fail-closed policies move high-confidence violations to `blocked` and request/activate the kill switch when a kill-switch adapter is supplied. Fail-open policies remain observable: they may continue as `leakDetected`, but they are never labeled `protected` while violations exist.

## Protection profiles and policy

`createTrafficProtectionPolicy()` provides bounded, validated policy snapshots for the profiles `strict`, `secure`, `balanced`, and `compatibility`. Strict mode requires fail-closed behavior, a kill switch, protected IPv4/IPv6, secure DNS, and no direct traffic. Compatibility mode allows explicitly configured direct fallback while preserving leak detection.

Supported policy concepts include tunnel/proxy/DNS requirements, allowed interfaces/routes/resolvers/transports, IPv4/IPv6 protection modes, fail-closed behavior, kill-switch requirements, leak blocking behavior, hysteresis/cooldown fields, and bounded resource limits.

## Leak detection

Implemented detectors classify:

- route leaks: unauthorized interfaces, unauthorized routes, direct paths when direct traffic is not allowed, and missing required tunnel context;
- DNS leaks: unauthorized resolvers, plaintext or disallowed transports, DNS bypassing required tunnel, unauthorized DNS interfaces, and blocked DNS paths;
- IPv4 leaks: IPv4 default and destination paths that violate the IPv4 policy;
- IPv6 leaks: IPv6 route and direct-bypass violations, with strict unprotected IPv6 reported as critical;
- tunnel leaks: required tunnel disconnected, degraded, failed, recovering, or unknown.

DNS leak classification is conservative: weak or incomplete evidence returns `unknown` or `suspectedLeak`; confirmed leaks require stronger resolver/transport or fail-closed evidence.

## Protection, kill switch, and firewall ownership

The production-facing interfaces are intentionally abstract:

- `Phase18KillSwitch` exposes `prepare`, `enable`, `disable`, `status`, and `validate`.
- `PlatformSecurityAdapter` owns privileged preparation, apply, rollback, status, and validation operations.
- `FirewallPolicy` records are bounded and must carry `owner = InternetResiliencePlatform`.

The generic security layer never calls Linux commands such as `ip`, `nft`, `iptables`, `nmcli`, `resolvectl`, or `systemctl`. Linux/firewall implementation remains behind Phase 10 kernel and platform security adapter boundaries. Owned rule reconciliation supports crash/startup recovery without flushing unrelated firewall rules.

## Events, telemetry, auditability, and explainability

The engine emits event-bus-compatible `security.*` events for validation start/completion/failure, violation detection, and kill-switch changes. It records privacy-safe counters such as `security_validation_total`, `security_validation_failure_total`, `security_route_leak_total`, `security_dns_leak_total`, `security_ipv6_leak_total`, `security_killswitch_enabled_total`, `security_killswitch_failure_total`, and `security_failclosed_total` without DNS query names, credentials, keys, or sensitive destination labels.

`ProtectionValidationResult` and `SecurityDecision` retain expected state, observed state, violations, confidence, action, and reason so operators can explain why traffic is protected, blocked, unprotected, or degraded.

## Simulation and test-only failure injection

`simulateProtection()`, `simulateLeakDetection()`, and `simulateRemediation()` are dry-run helpers. They never mutate firewall rules, routes, DNS settings, kill switches, or tunnels. Scenario tests inject route leaks, DNS leaks, IPv6 leaks, tunnel disconnects, kill-switch failure, policy mismatch, resource limits, and fail-open/fail-closed behavior by passing synthetic `ObservedNetworkState` values.

## Resource limits and concurrency

Validation is bounded by policy-configured limits for concurrent validations, violation history, remediation requests, validation intervals, stabilization periods, cooldowns, and failure thresholds. Stale validation results are guarded by monotonically increasing validation versions so an older validation cannot overwrite a newer security state.

## Current limitations and deferred work

Implemented: domain models, policy snapshots, expected/observed state, compliance evaluation, route/DNS/IPv4/IPv6/tunnel validation, kill-switch/platform contracts, owned firewall policy model, startup reconciliation, events, telemetry hooks, explainable decisions, simulations, resource limits, and scenario tests.

Experimental: concrete platform adapters can be wired through the Phase 10 kernel boundary.

Planned for future phases: native Linux nftables adapter packaging, OS-specific route/DNS observation collectors, fleet policy distribution, AI-assisted decisions, desktop/mobile clients, distributed nodes, and learning-based remediation.

Unsupported: direct shell/firewall mutation from the domain layer and plugin access to privileged networking without explicit capabilities.
