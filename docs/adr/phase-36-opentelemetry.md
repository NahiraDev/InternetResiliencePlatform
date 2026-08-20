# ADR — Phase 36 OpenTelemetry Integration

## Status

Accepted

## Context

InternetResiliencePlatform already exposes manual tracing primitives and Prometheus-specific metrics. Phase 35 introduced a vendor-neutral internal metrics bus so later integrations do not couple metric producers to an external backend.

Phase 36 needs a standards-based interoperability layer for traces and metrics without moving exporter concerns into core modules. The integration also has to be safe in production environments where an OpenTelemetry Collector may be unavailable or intentionally omitted.

## Decision

Use the official OpenTelemetry JavaScript Node SDK with OTLP over HTTP/protobuf exporters:

- `@opentelemetry/sdk-node` for Node runtime lifecycle.
- `@opentelemetry/exporter-trace-otlp-proto` for traces.
- `@opentelemetry/exporter-metrics-otlp-proto` for metrics.
- `@opentelemetry/resources` for resource identity.
- `@opentelemetry/sdk-trace-base` samplers for deterministic parent-based ratio sampling.

The Phase 35 `InternalMetricsBus` is the metric producer contract. The OpenTelemetry adapter subscribes to it and translates metric definitions and points into OpenTelemetry instruments.

Production startup initializes OpenTelemetry before dynamically importing the API application. This prevents application modules from acquiring no-op OpenTelemetry providers before SDK registration.

When no OTLP endpoint is configured, the SDK is started without an exporter and without the SDK's implicit default OTLP exporter. This makes telemetry optional at the infrastructure boundary and prevents accidental localhost network traffic.

## Alternatives Considered

### Vendor-specific SDK

Rejected. It would introduce backend coupling and make the platform's observability architecture harder to migrate.

### Custom OTLP implementation

Rejected. OTLP encoding, retries, resource semantics, batching, sampling, propagation, and lifecycle are standards concerns already implemented by the official SDK.

### Prometheus-only integration

Rejected. Prometheus is a later dedicated phase and does not provide the same standardized distributed tracing interoperability.

### OpenTelemetry auto-instrumentation bundle

Deferred. Broad auto-instrumentation can create duplicate HTTP signals alongside the platform's existing controlled-cardinality metrics and manual spans. Phase 36 therefore establishes the SDK and explicit integration boundary first. Individual instrumentations can be enabled later where they do not duplicate platform signals.

## Consequences

### Positive

- Vendor-neutral traces and metrics.
- Standard W3C trace context propagation.
- Standard OTLP export.
- Resource identity is consistent across telemetry signals.
- Metric producers remain independent from exporters.
- Collector outages do not make the API request path unavailable.
- Existing manual tracing code remains compatible.

### Negative

- The OpenTelemetry Node SDK is an additional runtime dependency.
- Some OpenTelemetry JavaScript packages remain experimental, so upgrades must be tested through the repository's CI gates.
- Prometheus-specific instrumentation remains temporarily duplicated until Phase 37 completes the exporter migration.

## Security

OTLP headers are treated as credentials and are never logged or returned in diagnostics. Metric labels continue to use Phase 35 cardinality bounds. No request payloads or authentication material are captured automatically by this integration.

## Operational Policy

The OpenTelemetry Collector is the preferred production aggregation boundary. Applications export OTLP telemetry to the collector rather than depending directly on a vendor backend whenever an operational deployment uses one.
