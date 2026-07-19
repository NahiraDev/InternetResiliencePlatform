# Phase 6 Network Intelligence Architecture

Phase 6 introduces the first production-oriented network intelligence core. The subsystem is measurement and decision-support infrastructure only: it does not perform VPN, proxy, traffic interception, censorship bypass, or automatic switching actions.

## Components

- `@irp/network`: probe plugin interfaces, built-in probes, health scoring, in-memory telemetry store, and monitoring scheduler.
- `apps/api`: Fastify routes for current network health, aggregate metrics, historical measurements, and manual probe execution.
- `apps/cli`: developer command `irp network check` for local diagnostics.
- `@irp/telemetry`: Prometheus counters, histograms, gauges, and OpenTelemetry tracer bootstrap integration points.
- `@irp/database`: Prisma models for durable measurements, known network nodes, and health scores.

## Data flow

1. A scheduler or manual trigger asks `NetworkMonitoringService` to run registered probes.
2. Each probe applies its own timeout and error handling and returns a normalized result.
3. Probe results become `NetworkMeasurement` records.
4. The monitoring service updates failure streaks and calculates a `NetworkHealthScore` from success ratio and latency.
5. API and CLI callers receive structured snapshots for operators and future routing/switching engines.
6. Prometheus metrics are emitted for success totals, failure totals, probe latency, and aggregate health score.

## Extension points

New probes implement `NetworkProbe` with a name, type, configuration object, and `execute` method. The service accepts a probe array, enabling test doubles, provider-specific probes, or deployment-specific node probes without changing the service contract.

## Future automatic switching integration

Future phases can consume measurements and health scores as inputs to a policy engine. Any switching layer should remain separate from probes so measurements stay auditable, low-risk, and independently testable.
