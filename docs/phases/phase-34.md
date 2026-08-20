# Phase 34 — Historical Analysis

## Goal

Provide a deterministic, provider-agnostic historical analysis layer over the benchmark/measurement data already collected by the platform. Operators must be able to query a bounded time range, inspect aggregate and per-probe trends, and export the resulting report without introducing a second measurement pipeline.

## Why This Phase Exists

Phases 31–33 established the learning, recommendation, and automatic-optimization direction. Those systems require an auditable historical view of what actually happened before and after decisions. Phase 34 supplies that read-only analytical foundation and deliberately keeps mutation, scheduling, and collection outside the package.

## Expected Outputs

- `@irp/historical-analysis` workspace package.
- Typed historical measurement query contract.
- In-memory store for deterministic tests and local use.
- PostgreSQL adapter over the existing `NetworkMeasurement` table.
- Time-bucketed report generation with automatic bucket selection.
- Summary statistics: sample count, availability, average latency, P50/P95/P99 latency, and packet loss when available.
- Per-probe series and trend analysis.
- Deterministic trend direction and confidence using bounded linear regression.
- JSON and CSV export helpers.
- Bounded query/sample limits to prevent unbounded historical reads.
- Validation for timestamps, metric ranges, and query windows.
- Documentation and acceptance tests.

## Architecture

```text
Existing measurement producers
            │
            ▼
     NetworkMeasurement
            │
            ▼
HistoricalMeasurementStore
      │             │
      │             └── InMemoryHistoricalMeasurementStore
      └──────────────── PostgresHistoricalMeasurementStore
            │
            ▼
   createHistoricalReport()
            │
      ┌─────┴─────┐
      ▼           ▼
  summaries     trends
      │           │
      └─────┬─────┘
            ▼
       JSON / CSV export
```

The analysis package is read-only. It does not probe networks, alter routes, change DNS, execute commands, or apply recommendations.

## Components

### `HistoricalMeasurement`

Normalized read model containing timestamp, probe type, success, optional latency, optional packet loss, and optional metadata.

### `HistoricalMeasurementStore`

Storage abstraction used by the report engine. Implementations may read PostgreSQL, a future analytical database, or deterministic in-memory data without changing report semantics.

### `PostgresHistoricalMeasurementStore`

Reads the existing `NetworkMeasurement` table through `@irp/database`. The adapter applies a bounded timestamp query and maximum row count. Packet loss is read from `metadata.packetLossPercent` when producers provide it.

### `createHistoricalReport()`

Builds a complete report from one bounded query. Bucket resolution is selected from the requested range:

- up to 24 hours: hourly;
- up to 7 days: six-hour;
- up to 30 days: daily;
- longer ranges: weekly.

### Trend analysis

For each metric, the engine calculates a least-squares slope against elapsed time and an R² confidence value. Direction is interpreted according to metric semantics: increasing availability is improving, while increasing latency or packet loss is worsening. Low explanatory power or negligible slope is reported as stable rather than overstating a trend.

## Interfaces

The package exports:

- `HistoricalMeasurement`
- `HistoricalQuery`
- `HistoricalMeasurementStore`
- `HistoricalBucket`
- `HistoricalTrend`
- `HistoricalSummary`
- `HistoricalSeries`
- `HistoricalReport`
- `InMemoryHistoricalMeasurementStore`
- `PostgresHistoricalMeasurementStore`
- `createHistoricalReport()`
- `exportHistoricalReportCsv()`
- `exportHistoricalReportJson()`

## APIs / Report Views

Phase 34 defines the application-level report contract rather than coupling the package to Fastify, Electron, or a particular UI. A later API/UI adapter can expose the same `HistoricalReport` directly.

A report view should expose at minimum:

- requested time range;
- selected probe types;
- total samples and availability;
- latency percentiles;
- packet-loss summary when available;
- time-series buckets;
- per-probe series;
- trend direction and confidence;
- export actions for JSON and CSV.

No report field contains credentials, request bodies, or raw network payloads.

## Database Changes

No migration is required. The phase reuses the existing `NetworkMeasurement` table created by the network-intelligence database migration.

The existing schema already contains timestamp, probe type, latency, success, and metadata fields. Packet loss is optional and remains backward-compatible through metadata.

## Configuration

No new runtime configuration is required. The analysis API enforces these safety bounds in code:

- default maximum samples: `50,000`;
- absolute maximum samples: `100,000`;
- query windows must have `from < to`;
- all timestamps must be valid ISO timestamps;
- latency must be finite and non-negative;
- packet loss must be within `0..100`.

Callers may apply stricter application-specific limits.

## Dependencies

- `@irp/database`
- TypeScript
- Vitest

No analytical framework or heavyweight statistics dependency is introduced. The required calculations are small, deterministic, and directly testable.

## Security Considerations

- Historical reads are explicitly bounded.
- The PostgreSQL adapter uses parameterized template queries through the existing database abstraction.
- No user identifiers are required by the report model.
- Metadata is treated as opaque optional data and is not emitted as a separate raw-payload export.
- The package has no write capability and cannot mutate runtime state.
- Invalid numeric values are rejected rather than silently normalized.

## Performance Targets

- In-memory report generation should remain linear in the number of returned measurements apart from bounded percentile sorting.
- PostgreSQL reads are limited to 100,000 rows maximum.
- No unbounded queue, retry loop, or background worker is introduced.
- Bucket generation is bounded by the requested time range and selected bucket size.

## Tasks

### Epic 34.1 — Historical Query Layer

- [x] Define normalized measurement contract.
- [x] Define storage abstraction.
- [x] Add bounded in-memory implementation.
- [x] Add PostgreSQL implementation over existing measurements.

### Epic 34.2 — Historical Reports

- [x] Add aggregate summary statistics.
- [x] Add automatic time bucketing.
- [x] Add per-probe series.
- [x] Add P50/P95/P99 latency reporting.

### Epic 34.3 — Trend Analysis

- [x] Add deterministic linear trend calculation.
- [x] Add metric-aware improving/worsening semantics.
- [x] Add confidence calculation.
- [x] Avoid false trends for insufficient/low-quality data.

### Epic 34.4 — Export

- [x] Add deterministic JSON export.
- [x] Add CSV export with safe escaping.

### Epic 34.5 — Tests and Safety

- [x] Test range and probe filtering.
- [x] Test summary and trend calculations.
- [x] Test bucket selection.
- [x] Test invalid input rejection.
- [x] Test export output.
- [x] Test query limit bounding.

## Tests

`packages/historical-analysis/src/index.test.ts` covers query filtering, summary statistics, percentile calculations, bucket selection, trend semantics, invalid input, exports, and bounded limits.

## Acceptance Criteria

- [x] Historical queries are time-bounded and deterministic.
- [x] Historical reads cannot exceed the absolute sample limit.
- [x] Reports include aggregate and per-probe summaries.
- [x] Reports include P50/P95/P99 latency when latency observations exist.
- [x] Reports include packet-loss statistics when packet-loss data exists.
- [x] Reports include metric-aware trend direction and confidence.
- [x] Long ranges automatically use coarser buckets.
- [x] JSON and CSV exports are deterministic and newline-terminated.
- [x] Invalid timestamps and metric ranges fail closed.
- [x] No network mutation or recommendation application exists in the package.
- [x] Existing database schema is reused without a migration.

## Definition of Done

- `@irp/historical-analysis` builds, lints, tests, and typechecks through the existing workspace pipeline.
- PostgreSQL access is bounded and uses the existing database abstraction.
- The package is independent from network-probing and optimization execution.
- Documentation describes the report contract and operational limits.

## Deliverables

- `packages/historical-analysis/package.json`
- `packages/historical-analysis/tsconfig.json`
- `packages/historical-analysis/src/index.ts`
- `packages/historical-analysis/src/index.test.ts`
- `docs/phases/phase-34.md`

## Future Extensions

- API and Electron report adapters.
- Materialized daily aggregates for very large datasets.
- Retention-aware downsampling.
- Regional/provider/ASN comparison views.
- Historical replay of recommendation and optimization outcomes.
- Scheduled report generation.
