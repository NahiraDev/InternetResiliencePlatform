# ADR: Phase 34 Historical Analysis Read Model

## Status

Accepted

## Context

The platform already records network measurements in `NetworkMeasurement`. Historical analysis must provide long-term reporting without creating a second collection pipeline or coupling analytics to a provider implementation.

## Decision

Implement `@irp/historical-analysis` as a read-only analytical package with a storage interface. The first durable adapter reads the existing PostgreSQL `NetworkMeasurement` table through `@irp/database`; an in-memory adapter provides deterministic tests and local usage.

Reports use bounded queries, deterministic percentile calculations, time buckets, and least-squares trend analysis. JSON and CSV are presentation/export formats built from the same report model.

## Consequences

### Positive

- Existing measurements are reused.
- No database migration is required.
- Storage and presentation remain replaceable.
- Historical reads are bounded and testable.
- Trend semantics are explicit and metric-aware.

### Negative

- Very large installations will eventually need materialized aggregates or a dedicated analytical store.
- Packet loss remains optional until producers persist it consistently.

## Rejected Alternatives

### Add a new analytics database immediately

Rejected because the current measurement volume and architecture do not justify a second persistence system yet. The storage abstraction leaves room for that migration later.

### Perform aggregation inside the measurement producers

Rejected because it would mix collection and historical reporting concerns and make retention/downsampling harder to evolve.

### Use a heavyweight statistics dependency

Rejected because the required operations are simple, deterministic, and small enough to implement with standard TypeScript primitives.
