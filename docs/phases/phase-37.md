# Phase 37 — Prometheus Integration

## Goal

Provide a production-grade Prometheus exposition layer built around the Phase 35 canonical metrics contract and compatible with the Phase 36 OpenTelemetry integration.

Prometheus is an operational scrape surface, not a second instrumentation system. Metric producers must continue to publish through the canonical metrics contract or the existing controlled HTTP/dependency/network instrumentation; the Prometheus layer owns exposition, type preservation, label-schema consistency and runtime safety.

## Scope

- Canonical Prometheus bridge for `@irp/metrics` `InternalMetricsBus`.
- Counter, gauge and histogram preservation.
- Stable Prometheus metric names and help text validation.
- Deterministic label-schema enforcement per metric.
- Standard Prometheus content type.
- Existing `/api/v1/metrics` endpoint retained for compatibility.
- No UI/dashboard implementation.
- No request-id, user-id, IP-address, token, query-string or raw-URL labels.
- Default Node/process metrics remain available through the Prometheus registry.

## Architecture

```text
Core producers
     |
     v
InternalMetricsBus (Phase 35)
     |
     +--------------------+
     |                    |
     v                    v
OpenTelemetry        Prometheus Bridge
(Phase 36)               |
     |                   v
     v             Prometheus Registry
OTLP exporter            |
                         v
                  /api/v1/metrics
```

The OpenTelemetry and Prometheus integrations are independent consumers. A collector or Prometheus server is not a runtime dependency of the application.

## Metric Semantics

### Counter

Each `counter` point is interpreted as an increment and added to the Prometheus counter. Counter producers must publish non-negative values; the Phase 35 bus already enforces that invariant.

### Gauge

Each `gauge` point replaces the current value for the exact label set.

### Histogram

Each `histogram` point is recorded as an observation in the Prometheus histogram. The default `prom-client` buckets are used unless a later phase introduces centrally governed bucket configuration.

## Label Safety

The first observation establishes the label-key schema for a metric in the Prometheus bridge. Any later point with a different key set is rejected as a schema conflict. This avoids malformed or internally inconsistent Prometheus families.

The existing Phase 35 metrics bus remains responsible for label name/value validation and cardinality bounds. Prometheus adds no route-specific or identity-specific dimensions.

## HTTP Endpoint

`GET /api/v1/metrics` remains the compatibility exposition endpoint.

Responses use the registry's Prometheus content type and should not be cached by intermediaries because the values are live process state.

The endpoint must not expose secrets, OTLP headers, credentials, request bodies or unbounded user-controlled labels.

## Default Runtime Metrics

The default registry continues to expose standard Node/process metrics with the `irp_` prefix, alongside IRP application metrics. This provides process CPU, memory, event-loop and runtime diagnostics without creating custom duplicate instrumentation.

## Failure Isolation

Prometheus scrape failures do not affect application request processing. The endpoint reads the local registry and performs no outbound network calls.

If the Prometheus integration is disabled by future configuration, the API must continue to serve health/readiness endpoints and core networking functionality.

## Security

Metrics are operational telemetry and are treated as potentially sensitive. Metric names and labels must not contain:

- authentication tokens
- cookies
- authorization headers
- user ids
- email addresses
- IP addresses
- full URLs/query strings
- request bodies
- database connection strings
- arbitrary exception messages

## Performance

- Scrape generation must be local-only.
- Metric exposition must not invoke external dependencies.
- Metric names and label schemas are validated once and reused.
- The bridge must not perform an unbounded historical scan for every scrape.
- The existing Prometheus registry remains the authoritative exposition source for the HTTP endpoint.

## Tests

Phase 37 tests cover:

1. Counter increments are accumulated correctly.
2. Gauges expose the latest value per label set.
3. Histograms accept observations and preserve their Prometheus family type.
4. Label schema drift is rejected.
5. Invalid Prometheus names are rejected.
6. Help text is sanitized.
7. Standard registry content type is returned.
8. Default Node/process metrics are exported.
9. Existing HTTP metrics remain available.
10. The `/api/v1/metrics` endpoint remains compatible.

## Acceptance Criteria

- [x] Canonical Prometheus bridge exists.
- [x] Counter semantics are preserved.
- [x] Gauge semantics are preserved.
- [x] Histogram semantics are preserved.
- [x] Label schema is deterministic.
- [x] Phase 35 label/cardinality validation remains authoritative.
- [x] Standard Prometheus content type is used.
- [x] Default process metrics remain available.
- [x] Existing `/api/v1/metrics` surface remains intact.
- [x] No UI/dashboard is introduced.
- [x] Tests cover bridge semantics and safety properties.

## Definition of Done

Prometheus is a production exposition mechanism rather than another source of instrumentation. Core producers remain exporter-neutral, `/api/v1/metrics` is scrape-compatible, label schemas are stable, cardinality is bounded, secrets are excluded, and the Prometheus layer can fail or be disabled without destabilizing the network agent.
