# Troubleshooting

Start by determining whether the failure is local, network-level, service-level, or runtime-level.

## Repository checks

```bash
pnpm validate
pnpm typecheck
pnpm test
pnpm build
```

## Runtime checks

Check service logs, health/readiness endpoints, database connectivity, and container status before changing configuration.

## Network diagnosis

Use the project's measurement and diagnostics surfaces to distinguish:

- DNS resolution failures;
- TCP connectivity failures;
- TLS negotiation failures;
- HTTP/application failures;
- packet loss and latency degradation;
- IPv4/IPv6 differences;
- local runtime/container failures.

Do not infer a network-wide outage from a single HTTP status or a single failed destination.

## Docker failures

When a container exits, inspect the first startup error and the container health status. Verify filesystem permissions for non-root runtime paths, especially application caches and generated runtime state.

## Regional validation

A GitHub-hosted runner does not provide Iranian egress merely because the tested endpoint is Iranian. Regional assertions require an appropriate regional vantage. See [`regional-validation.md`](../regional-validation.md).

## Escalation

If a failure cannot be reproduced locally, preserve the exact command, environment class, relevant logs, timestamp, and commit SHA. Do not include credentials or bearer tokens in diagnostics.
