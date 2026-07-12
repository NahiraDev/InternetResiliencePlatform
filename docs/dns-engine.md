# Intelligent DNS Engine

Phase 3 adds an active DNS management engine that continuously evaluates providers, scores them with configurable strategies, predicts degradation from recent benchmark history, and switches only when failover thresholds or stability margins justify it.

## Architecture

The `@irp/dns` package contains the core engine, cache, rule evaluator, profiles, system DNS adapter, and worker supervisor. Provider ranking combines latency, availability, packet loss, privacy, security, stability, and prediction weights.

## Strategies

Supported strategies are lowest latency, highest availability, lowest packet loss, balanced, privacy-first, security-first, and custom weighted scoring.

## Observability

Every routing decision and provider switch emits a structured event with timestamps and provider metadata for API, CLI, audit logging, and telemetry pipelines.
