# @irp/metrics

Unified internal metrics pipeline for InternetResiliencePlatform.

## Guarantees

- Typed counter, gauge, and histogram observations.
- Definition conflict detection.
- Bounded retention by sample count and age.
- Bounded labels to reduce accidental cardinality explosions.
- Querying by metric, type, time range, and labels.
- Immutable snapshots and subscriber payloads.
- No external I/O or vendor-specific dependencies.

## Intended use

Producers publish into `InternalMetricsBus`. OpenTelemetry, Prometheus, and dashboard integrations should subscribe to this bus rather than instrumenting producer code independently.
