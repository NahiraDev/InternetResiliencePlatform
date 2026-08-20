# Phase 36 — OpenTelemetry

## Goal

Provide a production-grade OpenTelemetry integration that turns the Phase 35 vendor-neutral metrics bus and existing manual tracing primitives into a standards-based telemetry pipeline. The integration must export traces and metrics over OTLP/HTTP protobuf, preserve W3C trace context, attach stable service/resource identity, apply deterministic sampling, remain bounded and non-blocking for application requests, and fail safely when no collector is configured or when the collector is unavailable.

## Why This Phase Exists

Phase 35 established the canonical internal metrics contract. OpenTelemetry is the interoperability layer that allows the platform to send that telemetry to an OpenTelemetry Collector or compatible backend without coupling core modules to a vendor. OpenTelemetry JavaScript currently treats traces and metrics as stable signals, and OTLP is the recommended vendor-neutral export protocol. The platform therefore uses the official Node SDK plus OTLP protobuf exporters rather than a custom wire implementation.

## Expected Outputs

- Official OpenTelemetry Node SDK integration.
- OTLP protobuf trace exporter.
- OTLP protobuf metric exporter.
- Phase 35 metrics-bus adapter for counter, gauge, and histogram points.
- Service/resource identity: `service.name`, `service.version`, and `deployment.environment.name`.
- Parent-based trace-ID-ratio sampling controlled by the platform configuration.
- W3C Trace Context propagation through the OpenTelemetry Node SDK.
- Per-signal OTLP endpoint support with a shared endpoint fallback.
- OTLP custom header support without logging credentials.
- Configurable export interval and timeout with bounded validation.
- Startup ordering that initializes OpenTelemetry before the API application module is imported in production.
- Graceful telemetry shutdown on SIGTERM/SIGINT.
- No collector dependency when telemetry is enabled but no OTLP endpoint is configured.
- No default implicit OTLP exporter when no endpoint is configured.
- Existing manual `runWithSpan()` instrumentation remains compatible with the SDK.
- Existing Prometheus metrics remain available during the Phase 36 transition; Phase 37 owns the Prometheus exporter migration.
- Documentation, ADR, tests, and CI coverage.

## Architecture

```text
                         Application
                              |
                +-------------+-------------+
                |                           |
          manual spans                Phase 35 bus
                |                           |
                v                           v
        OpenTelemetry API          MetricsBridge
                |                           |
                +-------------+-------------+
                              |
                         NodeSDK
                       /         \
                      /           \
             Trace pipeline     Metric pipeline
                    |                  |
             BatchSpanProcessor   PeriodicReader
                    |                  |
             OTLP/protobuf         OTLP/protobuf
                    |                  |
                    +--------+---------+
                             |
                   OpenTelemetry Collector
                         or compatible backend
```

The SDK is an integration concern. Core application modules continue to use the OpenTelemetry API and `@irp/metrics` contract rather than importing exporters.

## Components

### OpenTelemetry runtime

`packages/telemetry/src/opentelemetry.ts` owns SDK lifecycle, resource configuration, exporters, sampling, endpoint normalization, timeout validation, and shutdown.

### Metrics bridge

The bridge subscribes to `InternalMetricsBus`. Definitions are mapped to OpenTelemetry instruments and points are forwarded as follows:

- `counter` → OpenTelemetry Counter `add()`.
- `gauge` → OpenTelemetry ObservableGauge backed by the latest value per bounded label set.
- `histogram` → OpenTelemetry Histogram `record()`.

The bridge never bypasses Phase 35 validation and does not invent labels.

### Trace pipeline

Manual spans created through `@opentelemetry/api` are recorded by the Node SDK. `runWithSpan()` continues to set success/error status and record exceptions. The SDK provides Node context management and W3C trace-context propagation.

### Startup integration

The production runtime validates configuration and database readiness first, initializes OpenTelemetry, then dynamically imports `@irp/api`. This ordering avoids loading the application before the SDK is registered and follows the Node SDK initialization requirement.

### Shutdown integration

The runtime closes Fastify first and then shuts down the OpenTelemetry SDK so queued spans and metrics have an opportunity to flush before process termination.

## Configuration

The following platform configuration is supported:

| Setting | Source | Purpose |
|---|---|---|
| `telemetry.enabled` | YAML / `TELEMETRY_ENABLED` | Master switch |
| `telemetry.serviceName` | YAML / `OTEL_SERVICE_NAME` / `TELEMETRY_SERVICE_NAME` | `service.name` |
| `telemetry.otlpEndpoint` | YAML / `OTEL_EXPORTER_OTLP_ENDPOINT` | Shared OTLP base endpoint |
| `telemetry.otlpTracesEndpoint` | YAML / `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | Trace-specific endpoint |
| `telemetry.otlpMetricsEndpoint` | YAML / `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | Metric-specific endpoint |
| `telemetry.otlpHeaders` | YAML / `OTEL_EXPORTER_OTLP_HEADERS` | Authentication/custom headers |
| `telemetry.sampleRatio` | YAML / `TELEMETRY_SAMPLE_RATIO` | Root trace sampling ratio |
| `telemetry.exportIntervalMs` | YAML / `OTEL_METRIC_EXPORT_INTERVAL` / `OTEL_EXPORT_INTERVAL_MS` | Periodic metric export interval |
| `telemetry.exportTimeoutMs` | YAML / `OTEL_EXPORT_TIMEOUT` | Per-export timeout |

A shared endpoint automatically receives `/v1/traces` and `/v1/metrics` signal paths. Signal-specific endpoints are used as-is when those paths are already present.

Headers use the standard comma-separated `key=value` form. Header values are never written to logs or health responses.

## Sampling

The runtime uses a `ParentBasedSampler` with a `TraceIdRatioBasedSampler` root sampler. The configured ratio is validated to the inclusive range `0..1`. Existing remote parent sampling decisions are respected, while new root traces are sampled deterministically from their trace IDs.

## Resource Attributes

The SDK merges the default Node resource with platform-owned attributes:

- `service.name`
- `service.version`
- `deployment.environment.name`

Default SDK resource attributes remain enabled so telemetry backends can identify the process, runtime, host, and SDK implementation.

## Security Considerations

- OTLP credentials are supplied through configuration but never logged.
- Health/status payloads expose exporter presence, not endpoints or header values.
- Metric labels remain subject to Phase 35 cardinality bounds.
- No request bodies, cookies, authorization headers, JWTs, tokens, passwords, or connection strings are added to spans by the Phase 36 integration.
- The platform does not require an external collector for startup.
- No exporter is implicitly created when no OTLP endpoint is configured; this prevents accidental network calls to a default collector.
- Exporter failures occur outside the application request path and do not make the API unavailable.

## Reliability and Failure Isolation

- Export uses the OpenTelemetry SDK's batching/periodic readers rather than synchronous request-path network I/O.
- Export timeouts are bounded by configuration validation.
- SDK shutdown is explicit and idempotent at the application lifecycle level.
- Missing endpoints result in an SDK without an exporter rather than a connection attempt to localhost.
- Collector unavailability does not block API startup after local configuration validation.

## Performance Targets

- No OTLP network request is made during ordinary application requests.
- Trace export is batched by the SDK.
- Metrics are periodically exported rather than pushed synchronously by producers.
- Metric producer code remains independent of exporter implementation.
- Export timeout is strictly less than the export interval to avoid overlapping periodic exports caused by configuration alone.

## Tests

The Phase 36 test contract covers:

1. Disabled telemetry is a no-op.
2. Invalid sampling ratios fail deterministically.
3. Invalid export intervals/timeouts fail deterministically.
4. Shared OTLP endpoints are normalized to signal-specific paths.
5. Resource identity is attached to the SDK.
6. No implicit exporter is configured when no endpoint is supplied.
7. Metrics bridge maps counters, gauges, and histograms correctly.
8. Existing metric labels remain bounded by the Phase 35 contract.
9. Runtime startup initializes telemetry before importing the API application.
10. Runtime shutdown closes telemetry after the HTTP server.
11. Configuration accepts shared and signal-specific endpoints.
12. OTLP header parsing rejects malformed input.
13. Existing tracing tests continue to pass.

## Acceptance Criteria

- [x] Official OpenTelemetry Node SDK is integrated.
- [x] OTLP protobuf trace exporter is integrated.
- [x] OTLP protobuf metric exporter is integrated.
- [x] Phase 35 metrics bus has a production adapter.
- [x] Counter, gauge, and histogram semantics are preserved.
- [x] Service/resource attributes are configured.
- [x] Parent-based ratio sampling is configured.
- [x] W3C propagation is provided by the Node SDK.
- [x] Shared and per-signal OTLP endpoints are supported.
- [x] Custom OTLP headers are supported and protected from logs.
- [x] Export interval and timeout are bounded and validated.
- [x] SDK startup occurs before the API application is dynamically imported in production.
- [x] SDK shutdown is part of graceful runtime shutdown.
- [x] Missing collectors do not prevent startup.
- [x] No accidental default exporter is created without an endpoint.
- [x] Existing manual spans remain compatible.
- [x] Documentation and ADR are present.
- [x] Tests cover configuration, lifecycle, bridge semantics, and safety properties.

## Definition of Done

The phase is complete when OpenTelemetry is a real runtime integration rather than a dependency-only addition: the SDK is initialized in the production startup path, OTLP exporters are configured from validated platform configuration, Phase 35 metrics can flow through the adapter, traces are sampled and propagated using standard mechanisms, shutdown is graceful, secrets are not exposed, and the repository gates pass.

## Deliverables

- `packages/telemetry/src/opentelemetry.ts`
- Updated `packages/telemetry/package.json`
- Updated `packages/config/src/index.ts`
- Updated default telemetry configuration
- Updated production runtime entrypoint
- OpenTelemetry tests
- This phase document
- Phase 36 ADR
- Updated observability documentation

## Future Extensions

- Phase 37: replace the transitional Prometheus-specific instrumentation with an exporter consuming the same Phase 35 bus.
- Phase 38: consume the standardized telemetry stream for Grafana-ready operational dashboards.
- Later phases may add logs signal export once the OpenTelemetry JavaScript logs API/SDK is treated as stable by the project.
