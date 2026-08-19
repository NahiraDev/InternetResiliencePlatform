# Configuration

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

## Phase 33 — Automatic Optimization

Automatic optimization is deliberately **disabled by default**. Enabling it is an explicit operator decision and must still pass the existing resilience-runtime policy and trust gates.

Recommended configuration mapping:

| Key | Default | Constraint |
| --- | ---: | --- |
| `AUTO_OPTIMIZATION_ENABLED` | `false` | must be explicitly enabled |
| `AUTO_OPTIMIZATION_MIN_CONFIDENCE` | `90` | `0..100` |
| `AUTO_OPTIMIZATION_MAX_RISK` | `25` | `0..100` |
| `AUTO_OPTIMIZATION_MIN_BENEFIT` | `60` | `0..100` |
| `AUTO_OPTIMIZATION_COOLDOWN_MS` | `30000` | `>= 0` |
| `AUTO_OPTIMIZATION_BUDGET_WINDOW_MS` | `3600000` | `> 0` |
| `AUTO_OPTIMIZATION_MAX_ACTIONS_PER_WINDOW` | `6` | integer `>= 0` |
| `AUTO_OPTIMIZATION_DRY_RUN` | `false` | dry-run never mutates |
| `AUTO_OPTIMIZATION_ROLLBACK_ON_VERIFY_FAILURE` | `true` | fail closed when rollback is unavailable |

Invalid values must fail validation rather than silently selecting a permissive fallback.

See [Phase 33](phases/phase-33.md) for the complete automatic-optimization safety contract.
