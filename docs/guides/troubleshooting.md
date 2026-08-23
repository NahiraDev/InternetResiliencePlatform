# Troubleshooting

Start with evidence and classify the failure before changing configuration. The goal is to identify the failing boundary, make the smallest safe change, and verify the result.

## First collect state

Record the platform/client version, IRP runtime version, current connection state, active policy if available, recent measurements, relevant logs, exact failure time, and affected destination. Never include credentials, bearer tokens, private keys, or other secret material in diagnostics.

## Repository checks

```bash
pnpm validate
pnpm typecheck
pnpm test
pnpm build
```

## Runtime checks

Check service logs, health/readiness endpoints, database connectivity, and container status before changing configuration. When a container exits, inspect the first startup error and verify filesystem permissions for non-root runtime paths.

## Failure classification

| Symptom | First boundary to inspect |
| --- | --- |
| Process will not start | Runtime/configuration |
| API unavailable | Control plane / transport |
| DNS failures | DNS subsystem / resolver path |
| TCP works but TLS fails | Transport / TLS |
| One destination fails | Destination/application path |
| Regions differ | Regional / egress evidence |
| Gateway unhealthy | Gateway health / provider adapter |
| Repeated route switching | Autopilot hysteresis / cooldown |
| Client differs from server | Session / synchronization lifecycle |

Use the project's measurement and diagnostics surfaces to distinguish DNS, TCP, TLS, HTTP/application, latency, packet loss, IPv4/IPv6, and local runtime failures. Do not infer a network-wide outage from a single HTTP result or probe.

## Safe debugging rule

Prefer observation before mutation. If a configuration change is required, make one bounded change, verify it, and retain enough evidence to roll it back.

## Automated recovery limits

Automation should stop when evidence is ambiguous, the recovery budget is exhausted, or the next action could create an unsafe or irreversible state. Expose the failure and diagnostics instead of repeatedly mutating the network.

## Regional validation

A GitHub-hosted runner does not provide a regional egress vantage merely because a destination is associated with that region. Regional assertions require an appropriate regional vantage and independently verifiable evidence. See [`regional-validation.md`](../regional-validation.md).

## Escalation

If a failure cannot be reproduced locally, preserve the exact command, environment class, relevant logs, timestamp, and commit SHA. Remove secrets before sharing diagnostics.
