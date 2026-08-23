# Telemetry and Analytics

Telemetry is the evidence layer used to understand current and historical network behavior. Analytics aggregates that evidence into bounded, explainable insights.

## Signal classes

- reachability and availability;
- latency, jitter, and packet loss;
- DNS resolution and failure characteristics;
- TLS/connect timing where measurable;
- path and gateway health;
- regional probe observations;
- client/runtime health.

## Data lifecycle

```text
Collect → Normalize → Validate → Store → Aggregate → Analyze → Explain
```

Analytics must preserve provenance and time windows. Derived scores should identify their inputs and should not be presented as raw measurements.

## Privacy and security

Collect only data necessary for resilience and diagnostics. Secrets, credentials, and sensitive payloads do not belong in ordinary telemetry. Retention and access controls must be explicit.
