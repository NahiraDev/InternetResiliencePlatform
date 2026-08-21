# Phase 38 — Operational Diagnostics

## Goal

Provide a production-grade, machine-readable operational diagnostics layer that can be consumed by CI, automation, remote clients and operators without a dashboard.

## Scope

- Deterministic diagnostic state model: healthy, degraded, unhealthy, unknown.
- Structured diagnostic report schema with a versioned contract.
- Actionable failure classification and recommendations.
- Readiness, liveness, network, platform and metrics checks.
- Correlation with existing platform dependency state, route decision evidence and telemetry state.
- Strict automation mode with non-zero exit status for unhealthy/degraded systems.
- Bounded local HTTP probing with an explicit timeout.
- No secrets, credentials, authorization headers, request bodies or arbitrary URL/query data in generated diagnostics.
- No UI/dashboard implementation.

## Automation Surface

```text
pnpm diagnostics
pnpm diagnostics:strict
```

The CLI targets `IRP_API_URL` or `http://127.0.0.1:8080` by default.

Optional controls:

```text
pnpm diagnostics -- --url http://127.0.0.1:8080 --timeout 5000
pnpm diagnostics:strict -- --url http://127.0.0.1:8080
```

The command emits JSON only on stdout, making it suitable for CI and machine ingestion. `--strict` exits non-zero when the aggregate state is not healthy.

## Diagnostic Checks

1. `/api/v1/live` — process liveness.
2. `/api/v1/ready` — dependency readiness, especially PostgreSQL.
3. `/api/v1/health/network` — live network probe health.
4. `/api/v1/platform/status` — dependencies, current decision, recovery state and telemetry context.
5. `/api/v1/metrics` — local Prometheus exposition availability.

The diagnostics layer does not require an external Prometheus server, OTLP collector, database query beyond the existing readiness endpoint, or network control-plane mutation.

## Safety

Diagnostics are strictly observational. They do not change routes, providers, tunnels, DNS configuration, firewall state or autopilot policy. A failed diagnostic must never trigger a blind retry or route flap.

## Acceptance Criteria

- [x] Versioned machine-readable diagnostic report model exists.
- [x] Deterministic diagnostic severity aggregation exists.
- [x] HTTP/transport failures are classified without leaking error payloads.
- [x] Readiness, network, platform and metrics surfaces are covered by automation.
- [x] Platform dependencies and decision evidence are preserved in the report.
- [x] Telemetry/metrics availability is represented separately from core connectivity.
- [x] Actionable recommendations are generated for degraded checks.
- [x] Strict automation exit semantics exist.
- [x] Deterministic unit tests cover classification and report construction.
- [x] No UI/dashboard is introduced.

## Definition of Done

An operator or automation system can run one deterministic command and receive a structured report describing process liveness, dependency readiness, network health, route/decision evidence and observability availability, with actionable next steps and safe non-zero exit semantics. Diagnostics remain observational and cannot mutate connectivity state.
