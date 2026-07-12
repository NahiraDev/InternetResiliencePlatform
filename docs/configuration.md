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
