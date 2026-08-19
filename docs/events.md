# Events

Phase 2 introduces the core runtime engine for InternetResiliencePlatform.

## Responsibilities

- Production-oriented asynchronous lifecycle management.
- Validated configuration with live reload and rollback semantics.
- Internal telemetry, events, scheduler jobs, and DNS provider state.
- Interfaces that keep providers, resolvers, plugins, and benchmarks isolated.

## Operational model

The daemon loads configuration, initializes dependency injection, discovers plugins, starts scheduler-backed background jobs, and shuts down gracefully on process signals. DNS providers expose consistent health, latency, protocol support, and metadata methods. Benchmarks maintain rolling statistics used by health scoring to select the preferred resolver without changing system DNS.

## Security notes

Configuration and provider definitions are schema validated. Plugin loading is interface-gated; the initial loader only discovers plugin entry points and does not execute arbitrary plugin code until a future signed/sandboxed loader is added.

## Phase 3 recommendations

- Add signed plugin manifests and an out-of-process plugin sandbox.
- Add real wire-format DoH/DoT implementations with DNSSEC validation.
- Persist benchmark history for long-term scoring.

## Phase 33 — Automatic Optimization Events

The `@irp/auto-optimization` package emits lifecycle events through the existing `EventSink`. Event payloads are operational metadata only and must not contain credentials, request bodies, raw network payloads, or other user-sensitive data.

| Event | Meaning |
| --- | --- |
| `auto_optimization.evaluated` | Eligibility evaluation completed. |
| `auto_optimization.blocked` | Recommendation was rejected by a safety/policy gate or pre-execution validation. |
| `auto_optimization.dry_run` | Recommendation passed policy but execution was intentionally suppressed because dry-run is enabled. |
| `auto_optimization.applied` | Runtime action executor completed successfully. |
| `auto_optimization.verified` | All configured postconditions were verified. |
| `auto_optimization.rolled_back` | Verification failed and the applied action was successfully rolled back. |
| `auto_optimization.failed` | Execution, verification, or rollback did not complete successfully. |

Common envelope fields are `eventId`, `occurredAt`, and `source=auto-optimization`, plus recommendation/action identifiers and technical outcome information.

The package does not create a new event bus or metrics registry; it uses the existing runtime observability ports.
