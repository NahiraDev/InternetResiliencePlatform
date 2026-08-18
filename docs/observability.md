# Phase 29 Observability Architecture

InternetResiliencePlatform uses the existing `@irp/logger`, `@irp/telemetry`, API health endpoints, and network probe services as the single observability foundation. The API initializes telemetry from validated configuration, records request/dependency/network signals, and exposes Prometheus text at `/api/v1/metrics`.

## Structured logging

Production logs are JSON records emitted by `@irp/logger`. Records include only meaningful fields: `timestamp`, `level`, `message`, `service`, `environment`, `requestId`, `traceId`, `spanId`, `component`, `operation`, `duration`, `status`, `error`, and sanitized context. Supported levels are `debug`, `info`, `warn`, `error`, and `fatal`; normal request completion is `info`, dependency degradation is `warn`, and failed requests are `error`.

Sensitive keys such as passwords, tokens, authorization headers, cookies, API keys, JWTs, session identifiers, and database URLs are redacted recursively before a transport writes a log record. Full request bodies and raw headers are not logged by default.

## Request correlation and tracing

Fastify receives or generates `x-request-id`, echoes `x-request-id` and `x-correlation-id`, and attaches the request id to request-completion and error logs. OpenTelemetry uses the configured service identity and active span context when one is available. The local repository currently depends on `@opentelemetry/api`; no collector endpoint is hardcoded and no external backend is required for startup.

Telemetry configuration is validated by `@irp/config`:

- `TELEMETRY_ENABLED=true|false`
- `TELEMETRY_SERVICE_NAME` or `OTEL_SERVICE_NAME`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `TELEMETRY_SAMPLE_RATIO` between `0` and `1`
- `LOG_LEVEL=debug|info|warn|error|fatal`

## Metrics

Prometheus metrics use controlled-cardinality labels. HTTP metrics label `method`, normalized `route`, `status_code`, and/or bounded `status_class`; they do not label request ids, query strings, raw URLs, user ids, IP addresses, or error messages.

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

`/api/v1/ready` checks the database through the existing database client and reports degraded readiness with HTTP 503 when the dependency fails. The readiness payload includes safe diagnostics: service name, version, environment, uptime, telemetry state, and database latency when measurable. `/api/v1/platform/status` includes database and queue dependency state plus the current observability/telemetry state.

## Dependency and network observability

Database readiness is measured with latency and failure counters. Network probes run through the existing `NetworkMonitoringService`; probe successes, failures, latency, health score, and platform status are recorded without logging credentials or high-cardinality request data.

## Failure isolation

Telemetry initialization validates local configuration but does not require a collector. An unavailable external telemetry backend is not part of the request path, so API requests and health endpoints continue to operate without an external exporter. Invalid local telemetry configuration fails deterministically during configuration/bootstrap.

## Troubleshooting

1. Check `/api/v1/ready` for service, database, uptime, and telemetry state.
2. Scrape `/api/v1/metrics` and inspect `irp_http_*`, `irp_dependency_*`, and `irp_probe_*` metrics.
3. Correlate JSON logs by `requestId`; when an OpenTelemetry SDK is installed and active, also correlate by `traceId` and `spanId`.
4. Verify that metric labels use normalized routes and never include query strings or secrets.
