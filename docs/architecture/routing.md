# Routing Architecture

Routing determines which network path traffic uses. In IRP it is treated as a high-impact control boundary, separate from passive measurement.

## Responsibilities

The routing subsystem may model route state, candidate paths, route health, and provider capabilities. Where route mutation is implemented, actions must remain explicit and policy-controlled.

## Decision boundary

Routing decisions consume network evidence and policy constraints. A route must not be changed solely because a single probe failed.

A decision should consider evidence quality, expected benefit, risk, cooldown/circuit-breaker state, and verification requirements.

## Apply and verify

A routing action is successful only when the requested state is applied and subsequent measurements demonstrate the expected connectivity behavior.

If verification fails, the runtime should use a supported rollback/recovery path or stop further escalation according to policy.

## Security

Route mutation is privileged behavior. It requires explicit authorization/capability and least-privilege execution. Observation APIs must not implicitly gain route mutation authority.

## Implementation status

The package implementation, runtime adapters, tests, and `PROJECT_STATE.md` are authoritative for which routing operations are actually supported on the current platform.
