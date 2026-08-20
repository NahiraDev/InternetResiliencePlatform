# Observability Architecture

InternetResiliencePlatform uses `@irp/logger`, `@irp/metrics`, `@irp/telemetry`, API health endpoints, and network probe services as the observability foundation. Phase 35 provides the canonical vendor-neutral metrics bus. Phase 36 adds the OpenTelemetry runtime/export layer. Phase 37 owns the native Prometheus exporter migration, and Phase 38 owns packaged Grafana dashboards.

## Structured logging

Production logs are JSON records emitted by `@irp/logger`. Records include only meaningful fields: `timestamp`, `level`, `message`, `service`, `environment`, `requestId`, `traceId`, `spanId`, `component`, `operation`, `duration`, `status`, `error`, and sanitized context.

Sensitive keys such as passwords, tokens, authorization headers, cookies, API keys, JWTs, session identifiers, and database URLs are redacted recursively before a transport writes a log record. Full request bodies and raw headers are not logged by default.

## OpenTelemetry

Phase 36 uses the official OpenTelemetry Node SDK and OTLP HTTP/protobuf exporters. Traces use the OpenTelemetry API and are exported through the SDK's batching pipeline when an OTLP trace endpoint is configured. Metrics are exported through a periodic reader when an OTLP metric endpoint is configured.

Resource identity includes:

- `service.name`
- `service.version`
- `deployment.environment.name`
- default Node/process/host resource attributes supplied by the SDK

Sampling uses a parent-based sampler with a deterministic trace-ID ratio root sampler. The platform configuration validates `TELEMETRY_SAMPLE_RATIO` in the inclusive `0..1` range.

The production runtime initializes OpenTelemetry before dynamically importing the API application. This prevents the API from acquiring a no-op provider before SDK registration. The runtime shuts down the SDK after closing the HTTP server.

## OTLP configuration

Supported settings:

- `TELEMETRY_ENABLED=true|false`
- `TELEMETRY_SERVICE_NAME` or `OTEL_SERVICE_NAME`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`
- `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`
- `OTEL_EXPORTER_OTLP_HEADERS` as comma-separated `key=value` pairs
- `TELEMETRY_SAMPLE_RATIO`
- `OTEL_METRIC_EXPORT_INTERVAL` or `OTEL_EXPORT_INTERVAL_MS`
- `OTEL_EXPORT_TIMEOUT`

A shared OTLP endpoint receives `/v1/traces` and `/v1/metrics` automatically. Signal-specific endpoints override the shared endpoint for their respective signal.

When no endpoint is configured, the SDK is intentionally started without an exporter and without the SDK's implicit default OTLP exporter. This prevents accidental network traffic to a local collector.

## Request correlation and tracing

Fastify receives or generates `x-request-id`, echoes `x-request-id` and `x-correlation-id`, and attaches the request id to request-completion and error logs. The OpenTelemetry Node SDK supplies W3C Trace Context propagation and Node context management. Existing `runWithSpan()` calls therefore produce real SDK spans once the production runtime is initialized.

Trace and span identifiers are safe correlation metadata. Authentication material and request bodies are not captured by the Phase 36 integration.

## Metrics

Phase 35 is the canonical metric model:

- typed counter, gauge, and histogram definitions
- bounded labels
- bounded in-memory retention
- deterministic definitions and snapshots
- synchronous producer/subscriber contract

Phase 36 maps these definitions into OpenTelemetry instruments through a metrics-bus adapter. Counters use `Counter.add`, histograms use `Histogram.record`, and gauges use `ObservableGauge` backed by the latest value per bounded label set.

Existing Prometheus-specific metric families remain available during the transition so Phase 36 does not regress current dashboards or health endpoints. Phase 37 will consume the same Phase 35 bus through a Prometheus exposition adapter rather than duplicating instrumentation.

## Existing Prometheus metrics

The API currently exposes `/api/v1/metrics` using the existing `prom-client` registry. Controlled-cardinality labels remain mandatory: HTTP metrics use normalized routes and bounded status classes; request ids, query strings, raw URLs, user ids, IP addresses, secrets, and error messages are not metric labels.

Implemented metric families include:

- `irp_http_requests_total`
- `irp_http_request_duration_seconds`
- `irp_http_active_requests`
- default Node.js/process metrics with the `irp_` prefix
- `irp_runtime_event_loop_lag_ms`
- `irp_dependency_latency_ms`
- `irp_dependency_failures_total`
- `irp_probe_success_total`
- `irp_probe_failure_total`
- `irp_network_latency_ms`
- `irp_network_health_score`
- `irp_telemetry_failures_total`

## Health and diagnostics

`/api/v1/ready` checks the database and reports degraded readiness with HTTP 503 when the dependency fails. The readiness payload includes safe diagnostics such as service name, version, environment, uptime, and telemetry state. It never returns OTLP endpoints or header values.

`/api/v1/platform/status` includes database and queue dependency state plus the current observability/telemetry state.

## Dependency and network observability

Database readiness is measured with latency and failure counters. Network probes run through the existing `NetworkMonitoringService`; probe successes, failures, latency, health score, and platform status are recorded without logging credentials or high-cardinality request data.

## Failure isolation

Telemetry initialization validates local configuration and starts without requiring a collector. Export work is outside the request path. Bounded export timeouts prevent exporter configuration from creating an unbounded wait. Collector outages therefore do not make API readiness or ordinary request handling depend on the collector.

## Troubleshooting

1. Check `/api/v1/ready` for service, database, uptime, and telemetry state.
2. Scrape `/api/v1/metrics` and inspect `irp_http_*`, `irp_dependency_*`, and `irp_probe_*`.
3. Correlate JSON logs by `requestId`; correlate distributed traces by `traceId` and `spanId` when OpenTelemetry is configured.
4. Verify that metric labels use normalized routes and bounded dimensions.
5. If OTLP export is expected, verify the configured endpoint and signal-specific overrides without exposing the configured header values.
6. If no collector is intended, leave OTLP endpoints unset; the SDK will remain active for API tracing but will not create an implicit exporter.
