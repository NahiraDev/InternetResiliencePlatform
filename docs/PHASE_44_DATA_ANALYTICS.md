# Phase 44 — Data Analytics & Decision Intelligence

## Objective
Turn IRP's accumulated network, telemetry, historical-analysis, and distributed-probe evidence into a bounded analytics layer that produces trustworthy summaries, trends, anomaly signals, and decision-support data for Core, API, Desktop, and the future full-capability Mobile Client.

## Scope
- Time-windowed analytics over historical network measurements and signed regional probe evidence.
- Availability, latency, jitter, packet-loss, DNS/TCP/TLS/HTTP health metrics where source data exists.
- Percentiles (p50/p95/p99), aggregates, trend direction, confidence, and sample sufficiency.
- Region/probe/destination/service dimensions without conflating egress identity with destination identity.
- Anomaly detection with deterministic, bounded methods; no opaque ML dependency in the baseline.
- Analytics APIs designed for Desktop and Mobile clients using the same contracts.
- Exportable JSON/CSV reports.
- Data-quality validation, stale-data handling, bounded query sizes, and privacy-safe metadata handling.
- Tests and operational documentation.

## Non-goals
- Autonomous routing changes based solely on analytics.
- Unbounded machine learning or model training.
- Collecting sensitive payload contents.
- Replacing the existing historical-analysis or telemetry packages; Phase 44 composes them.

## Required architecture

```text
Measurements / Telemetry / Federation Evidence
                    |
                    v
             Analytics Engine
                    |
       +------------+-------------+
       |            |             |
   Aggregates     Trends       Anomalies
       |            |             |
       +------------+-------------+
                    |
              Analytics API
             /      |       \
        Desktop   Mobile    Core
```

The analytics layer must be deterministic, bounded, explainable, and read-oriented. Any future policy/action engine consumes analytics as evidence and remains responsible for safety checks, decisioning, apply, verification, and rollback.

## Acceptance criteria
1. Analytics can query a bounded time range and return deterministic summary statistics.
2. p50/p95/p99, availability, latency, and packet-loss are calculated correctly with explicit insufficient-data semantics.
3. Trends expose direction, slope/change, sample count, and confidence rather than a bare score.
4. Analytics can group results by probe/region/destination/service dimensions supported by the underlying evidence model.
5. Anomaly signals include the metric, observed value, baseline/window, severity, confidence, and reason.
6. Invalid timestamps, invalid ranges, impossible measurements, and oversized queries are rejected.
7. Missing/stale data is represented explicitly and never silently treated as healthy.
8. Analytics APIs use shared typed contracts consumable by Desktop and Mobile.
9. JSON and CSV exports are deterministic and do not leak secrets or raw payload data.
10. Unit tests cover normal, empty, sparse, outlier, boundary, and invalid-input cases.
11. `pnpm typecheck`, `pnpm lint`, and relevant tests pass before Phase 44 is considered complete.

## Mobile requirement
The future Mobile Client is a **Full Client**, not a read-only remote controller. Phase 44 analytics contracts must therefore be first-class client capabilities: the same analytics data and actions exposed to Desktop must be available to Mobile subject only to platform-native capability constraints and authorization.

## Security and privacy
- Treat telemetry/evidence as untrusted input.
- Do not expose probe private keys, access tokens, credentials, raw request payloads, or unrelated metadata through analytics.
- Enforce authorization at API boundaries.
- Keep query limits and aggregation windows bounded.
- Preserve provenance for evidence-derived analytics.

## Definition of Done
- Implementation integrated with existing packages without duplicate analytics frameworks.
- Shared contracts documented.
- API integration tested.
- Unit/integration tests added.
- Documentation and changelog updated.
- CI green on the final commit.
