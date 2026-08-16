# Phase 22 Resilience Runtime

The resilience runtime is a deterministic orchestration/control-plane layer. It observes normalized evidence, correlates incidents, arbitrates runtime policy, creates abstract intents, delegates candidate decisions to subsystem adapters, validates plans before mutation, simulates by default, executes only through approved capability adapters, verifies postconditions, delegates recovery to failover, records immutable decisions, and supports simulation-only replay.

## Boundaries

Runtime orchestration does not replace network intelligence, routing, connectivity, failover, tunnel, kernel, security, telemetry, events, or plugin subsystems. Domain logic remains behind ports and adapters.

## Ports and adapters

The package defines observation, incident correlation, policy, decision, planning, validation, execution, verification, recovery, capability, persistence, event, and telemetry ports. In-memory stores and sinks are provided for deterministic tests and future persistence replacement.

## State machine

Legal lifecycle states are idle, observing, analyzing, planning, validating, executing, verifying, recovering, degraded, blocked, stopped, and failed. Illegal transitions are rejected and all transitions emit structured runtime events with correlation ids.

## Decision lifecycle

Each cycle creates a RuntimeContext snapshot, collects observations, correlates incidents, asks adapters for candidates, performs stable deterministic ranking, validates policy/capabilities/freshness/conflicts, optionally executes, verifies, recovers if needed, and stores a DecisionRecord.

## Security and plugins

Security failures fail closed and remain distinct from availability failures. Unknown/untrusted capabilities are rejected. The runtime exposes no arbitrary shell execution and no plugin bypass path; plugin behavior must remain mediated by existing plugin APIs, sandboxing, permissions, capabilities, and policy enforcement.

## Replay and observability

Replay defaults to simulation and compares deterministic planning results against a stored record. Runtime events and telemetry use bounded metric names without secrets or high-cardinality labels. Snapshots report unknown when no evidence exists.
