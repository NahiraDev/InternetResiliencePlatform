# Connectivity Observation

Demonstrates a minimal connectivity observation workflow using the platform's API surface.

## Run

Start the API, then:

```bash
node examples/connectivity/check.mjs
```

Set `IRP_API_BASE_URL` to target a different local IRP API instance.

This example observes platform state and reports the response. It does not apply routing, DNS, tunnel, firewall, or failover changes.
