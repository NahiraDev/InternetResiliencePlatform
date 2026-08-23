# Probes and Evidence

IRP uses probes to collect bounded observations about network conditions and converts those observations into typed evidence for downstream decisions.

## Evidence principles

- Every observation has a source and observation time.
- Evidence should be independently attributable where the security model requires it.
- Freshness limits prevent stale observations from being treated as current state.
- Missing or insufficient evidence is represented explicitly rather than converted into a permissive result.
- Measurements such as latency, loss, DNS, HTTP/TLS health, egress identity, and destination identity remain distinct evidence dimensions.

## Probe boundaries

Probes observe network state. They should not silently mutate routes, DNS configuration, tunnels, credentials, or failover state as a side effect of measurement.

Federated probes can corroborate observations from different vantage points. Assurance and policy layers consume the resulting evidence without treating one measurement as proof of unrelated capabilities.

Implementation details belong in `docs/network/`, `docs/architecture/`, and the relevant package documentation.
