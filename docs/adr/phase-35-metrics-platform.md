# ADR: Phase 35 Metrics Platform

## Status

Accepted

## Context

The platform already exposes Prometheus-oriented metrics through `@irp/telemetry`, while historical analysis and future observability integrations need a stable internal representation of measurements. Binding producers directly to an exporter makes later OpenTelemetry, Prometheus, and dashboard integrations duplicate instrumentation and spreads observability concerns across the codebase.

## Decision

Introduce `@irp/metrics` as a provider-agnostic internal metrics platform with four responsibilities:

1. Register metric definitions and reject semantic conflicts.
2. Validate and publish immutable metric points through an in-process bus.
3. Retain a bounded in-memory window using both sample-count and age limits.
4. Provide bounded queries and deterministic snapshots for downstream consumers.

The core package has no external I/O and no dependency on any observability vendor. Exporters remain adapters owned by later phases and subscribe to the same internal metric stream.

## Consequences

### Positive

- Producers have one stable internal metrics contract.
- Retention is bounded before exporter integration.
- Label cardinality is explicitly constrained.
- OpenTelemetry and Prometheus can consume the same validated stream.
- The core metric model is easy to test deterministically.

### Negative

- The in-memory store is process-local and not a fleet-wide persistence layer.
- Raw histogram observations are retained instead of pre-aggregated.
- Existing direct Prometheus instrumentation remains during the transition; future phases can migrate exporters without redesigning the metric contract.

## Rejected Alternatives

### Make Prometheus the internal source of truth

Rejected because it couples core instrumentation to one exposition model and makes non-Prometheus consumers unnecessarily dependent on exporter semantics.

### Persist all metric points in PostgreSQL immediately

Rejected for Phase 35 because persistence, partitioning, and long-term retention are separate operational concerns. The bounded store establishes semantics first and can later be replaced or augmented by a durable adapter.

### Use an unbounded event bus

Rejected because metric production is a high-frequency path and unbounded retention would turn instrumentation into a memory availability risk.
