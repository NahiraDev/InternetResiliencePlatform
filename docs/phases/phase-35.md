# Phase 35 — Metrics Platform

## Goal

Provide a unified, provider-agnostic internal metrics pipeline that every observability integration can consume without requiring metric producers to know about Prometheus, OpenTelemetry, Grafana, or any other external backend.

## Why This Phase Exists

The platform already exposes Prometheus metrics and has telemetry primitives, but those signals currently originate directly from integration-specific collectors. Phase 35 establishes the internal source of truth first. Later phases can attach OpenTelemetry and Prometheus exporters to the same pipeline without duplicating business instrumentation or coupling core modules to an observability vendor.

## Expected Outputs

- `@irp/metrics` workspace package.
- Typed metric definitions for counter, gauge, and histogram observations.
- Deterministic metric point schema with timestamps and bounded labels.
- Internal pub/sub metrics bus.
- Metric definition registry with conflict detection.
- Bounded in-memory retention store with both age and sample-count limits.
- Query API for metric name, type, time range, labels, and bounded result count.
- Stable snapshots containing metric definitions and retained points.
- Validation against invalid names, values, timestamps, labels, and retention policies.
- Listener isolation through unsubscribe handles.
- Unit tests covering validation, retention, querying, registry conflicts, snapshots, and subscriptions.

## Architecture

```text
                        +----------------------+
                        | Network / API / Core |
                        | metric producers     |
                        +----------+-----------+
                                   |
                                   v
                        +----------------------+
                        | InternalMetricsBus    |
                        | - define()            |
                        | - record()            |
                        | - subscribe()         |
                        | - query()             |
                        +----+-------------+-----+
                             |             |
                 +-----------+             +----------------+
                 v                                            v
      +--------------------+                        +--------------------+
      | MetricRegistry     |                        | RetainedMetricStore|
      | type/name/unit     |                        | age + count bounds |
      +--------------------+                        +--------------------+
                                                            |
                                                            v
                                                   +------------------+
                                                   | Export adapters  |
                                                   | Phase 36/37/38   |
                                                   +------------------+
```

The metrics package is intentionally unaware of network probing, HTTP, databases, Prometheus, OpenTelemetry, or application lifecycle concerns.

## Components

### `MetricDefinition`

A registered metric contract containing a valid metric name, semantic type, human-readable description, and optional unit. Re-registering a name with different semantics fails fast instead of silently changing downstream meaning.

### `MetricPoint`

An immutable observation containing metric name, type, numeric value, epoch-millisecond timestamp, and a bounded label map.

### `MetricRegistry`

Central in-process definition registry. Definitions are immutable and returned in deterministic lexical order for stable snapshots and tests.

### `RetainedMetricStore`

Bounded in-memory retention layer. Two independent limits are enforced:

- `maxSamples` prevents unbounded memory growth under high event rates.
- `maxAgeMs` prevents stale observations from remaining indefinitely.

The store exposes filtering by metric name, type, timestamp range, and labels. Queries also have a hard upper bound derived from the retention policy.

### `InternalMetricsBus`

The producer-facing façade. Producers register metrics once and publish observations through `record()`. Subscribers receive immutable copies and can detach through an unsubscribe function. The bus stores every accepted point before publishing it so retained history and live consumers observe the same validated event.

## Metric Semantics

### Counter

A monotonically increasing observation. The internal platform accepts only non-negative values; increment/reset semantics remain the responsibility of the producer or future exporter adapter.

### Gauge

A point-in-time value that may increase or decrease.

### Histogram

A non-negative observation representing a measured distribution sample such as latency or payload size. The internal store retains raw observations; percentile/bucket aggregation belongs in exporters or analytical consumers rather than the core bus.

## Label Safety

To prevent accidental high-cardinality memory growth:

- Maximum labels per point: 16.
- Maximum individual label value: 256 characters.
- Label names must match the conventional `[A-Za-z_][A-Za-z0-9_]*` form.
- Values are normalized to strings.

The platform deliberately does not invent labels automatically. Producers must choose bounded dimensions appropriate for the metric's cardinality budget.

## Retention Policy

Default policy:

- 10,000 retained samples.
- 24 hours maximum age.

Both values are configurable at construction time. Invalid policies are rejected immediately. Changing the policy prunes existing observations immediately so the store cannot temporarily exceed the new limits.

## API Surface

```ts
const metrics = createMetricsPlatform({
  retention: { maxSamples: 20_000, maxAgeMs: 86_400_000 },
});

metrics.define({
  name: 'irp_http_requests_total',
  type: 'counter',
  description: 'HTTP requests completed',
});

const unsubscribe = metrics.subscribe((point) => {
  // future OTel/Prometheus adapters consume the same point stream
});

metrics.record('irp_http_requests_total', 1, {
  labels: { method: 'GET' },
});

const points = metrics.query({
  name: 'irp_http_requests_total',
  labels: { method: 'GET' },
  limit: 100,
});
```

## Configuration

Phase 35 does not introduce environment variables. The core package receives retention limits programmatically so application configuration remains owned by `@irp/config` and can be mapped into the metrics package by the application composition layer.

## Security Considerations

The metrics layer must not become a secret storage channel. Producers must never place tokens, passwords, raw authorization headers, cookies, connection strings, or sensitive request payloads into labels or values. The package provides structural bounds but cannot classify arbitrary metric content semantically.

Label cardinality is an availability concern as well as a performance concern; the 16-label and 256-character bounds are enforced before data enters the store or subscriber pipeline.

## Performance Targets

- O(1) registration lookup by metric name.
- O(1) append amortized for retained points, excluding bounded pruning.
- No external I/O in the core package.
- Query cost is linear in the retained sample window and therefore bounded by `maxSamples`.
- Listener dispatch occurs synchronously after successful storage so consumers observe only validated points.

## Tests

The package test suite covers:

1. Metric name and definition validation.
2. Definition conflict detection.
3. Sample-count retention.
4. Age-based retention.
5. Metric filtering and bounded query results.
6. Counter/histogram value validation.
7. Timestamp validation.
8. Label cardinality limits.
9. Subscription and unsubscribe semantics.
10. Deterministic snapshots.

## Acceptance Criteria

- [x] Independent `@irp/metrics` package exists under `packages/metrics`.
- [x] Package exposes typed metric definitions and observations.
- [x] Internal metrics bus supports publish/subscribe and querying.
- [x] Retention is bounded by both count and age.
- [x] Definitions reject incompatible re-registration.
- [x] Label and value validation occurs before storage.
- [x] Snapshot output is deterministic.
- [x] Unit tests cover the safety-critical behaviors.
- [ ] Application-wide producer migration is completed without coupling later exporters.

The final unchecked item is intentionally a cross-cutting integration task that should be completed when the API composition layer is migrated to the new internal bus; it is not satisfied by merely adding the library. Phase 36 should consume this package as the canonical source before adding OTel export.

## Definition of Done

Phase 35 is implementation-complete when the package, documentation, tests, and integration contract are merged and CI validates build/lint/typecheck/test. Before calling the phase production-complete, the API and network producers must be migrated to publish through the bus rather than maintaining observability-only instrumentation paths independently.

## Future Extensions

- Phase 36: OpenTelemetry adapter subscribing to `InternalMetricsBus`.
- Phase 37: Prometheus exposition adapter consuming the same point/definition model.
- Phase 38: Dashboard-oriented aggregations and packaged Grafana views.
- Persistent metric storage for multi-process/fleet deployments when operational volume requires it.
