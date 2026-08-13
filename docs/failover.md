# Phase 16 — Intelligent Auto Failover & Recovery Engine

Phase 16 adds a unified recovery **orchestrator** in `@irp/failover`. It consumes health signals, dependency state, subsystem candidate APIs, and policy decisions, then produces bounded, explainable recovery plans. It does not replace the Kernel, Rule Engine, Connectivity Manager, Routing Engine, Smart DNS Engine, or Secure DNS Transport layer.

## Architecture reuse

- **Kernel boundary:** privileged changes remain delegated to existing subsystem adapters. Phase 16 never shells out to `ip`, `iptables`, `nft`, `nmcli`, `resolvectl`, or `systemctl`.
- **Phase 11 policy:** `RecoveryAdapters.policy` is the integration point for the existing policy/rule layer. A policy denial produces a degraded/escalated plan rather than a bypass.
- **Phase 12 connectivity:** candidates are read from `ConnectivityManager.getAvailableSources()` and source changes use `ConnectivityManager.switchSource(..., 'recovery')`.
- **Phase 13 routing:** route candidates are obtained by `RoutingEngine.simulateRouting(...)`; applying routes remains `RoutingEngine.applyPlan(...)`.
- **Phase 14 DNS:** resolver candidates come from `SmartDnsEngine.decide(..., true)` and resolver selection uses DNS manual override APIs.
- **Phase 15 secure DNS transport:** secure transport alternatives are represented as low-disruption encrypted transport candidates. Security failures reject insecure fallback.
- **Events/telemetry/audit:** the engine emits `recovery.*` domain events, bounded metrics, and audit records through injected repository services.

## Failure model

A normalized `Failure` includes an ID, domain, component, type, severity, confidence, detection time, source, evidence, impact, and state. Supported domains are connectivity, route, DNS, DNS transport, resolver, service, platform, configuration, and security. Supported states include detected, confirmed, recovering, recovered, unresolved, escalated, suppressed, and resolved.

Detection is intentionally conservative: one weak signal is not enough when `detectionThreshold` and `confirmationThreshold` require repeated evidence. Confidence is computed from repeated evidence, timeout signals, health score degradation, and security/policy status. Classification distinguishes transient, intermittent, persistent, dependency, configuration, policy, security, resource, systemic, unknown, and avoids treating every timeout as a hard failure.

## Dependency graph and correlation

`DependencyGraph` models upstream/downstream relationships. The default graph follows the implemented platform stack:

```text
connectivity -> route -> dns-transport -> resolver -> dns -> service -> platform -> configuration -> security
```

The graph can add arbitrary dependencies and supports upstream lookup, downstream impact lookup, and dependency-aware recovery ordering. Correlation collapses simultaneous downstream failures behind the highest upstream cause so a Wi-Fi degradation, route failure, DNS timeout, and DoH failure become one recovery operation when appropriate.

## Recovery state machine

The explicit recovery state machine supports:

`idle`, `detecting`, `confirming`, `planning`, `executing`, `validating`, `recovered`, `stabilizing`, `rolling-back`, `degraded`, `escalated`, and `cooldown`.

Invalid transitions are rejected. The engine also uses per-domain locks so two conflicting failovers cannot run simultaneously against the same recovery domain.

## Recovery strategies, candidates, and scoring

A `RecoveryStrategy` defines trigger, scope, priority, prerequisites, actions, validation, rollback, cooldown, and budget. A `RecoveryPlan` contains selected candidates, rejected candidates, executable steps, validation, rollback, timeout, dry-run status, and reason.

Candidate eligibility checks include:

- capability and adapter availability
- automatic recovery policy flags
- health and circuit-breaker status
- security downgrade protection
- dependency scope
- bounded candidate limits

Scoring is composable through score components such as health, disruption cost, and stability. The selected action follows the minimum-disruption principle: re-probe/retry first, then secure transport/resolver changes, then routes, then connectivity, and finally degraded/escalated handling.

## Budgets, backoff, circuit breaking, hysteresis, and cooldown

`RecoveryBudget` bounds retries, recovery attempts, failovers, component switches, and total duration. `CircuitBreaker` implements closed/open/half-open behavior with cooldown and controlled re-entry. Configuration exposes retry, failover, recovery, cooldown, hysteresis, stabilization, timeout, and concurrency limits. Historical recovery data is capped by `maxHistory` to avoid unbounded memory growth.

## Validation, rollback, stabilization, degraded mode, and escalation

Plans are transactional where practical: execute steps, validate using injected validation probes, then mark recovered and stabilizing. Failed validation triggers rollback when rollback is defined. If rollback is unavailable or fails, the engine enters degraded or escalated state and emits structured information for observability/API layers.

## Manual override and simulation

Manual overrides support forcing preferred behavior, disabling automatic failover, forcing recovery, clearing failure state, resetting a circuit breaker, and resetting budgets. Overrides are emitted and auditable.

`simulateRecovery(...)` is a dry run. It never invokes real connectivity switching, route changes, DNS changes, privileged Kernel operations, or transport mutation. It returns the detected failure, confidence, affected components, candidates, rejected candidates, selected strategy, execution order, expected outcome, rollback plan, and explanation.

## Plugin compatibility and future AI integration

The engine is adapter- and interface-driven so future plugins can provide recovery strategies, detectors, probes, validation, actions, rollback, and scoring factors through the existing plugin model. Recovery history exposes failure context, strategy, outcome, duration, cost, stability, rollback, policy, and environment for later AI/learning phases without implementing AI in Phase 16.
