# Observability

Observability is part of the resilience system because diagnosis and recovery require evidence.

## Signals

IRP uses four primary signal classes:

- structured logs;
- metrics;
- traces;
- network measurements and health state.

## Operational questions

Observability should make it possible to answer:

- Is the service alive and ready?
- Which network layer is degraded?
- When did degradation begin?
- Which decision was made and why?
- Which action was applied?
- Did verification succeed?
- Was rollback triggered?

## Security

Never emit bearer tokens, refresh tokens, passwords, device secrets, private keys, or equivalent credentials into logs, metrics labels, traces, or diagnostic payloads.

## Tooling

The implementation is designed around OpenTelemetry and Prometheus-compatible metrics. The running code and deployment configuration determine which exporters and collectors are enabled in a given environment.
