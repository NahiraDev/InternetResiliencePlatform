# IRP Linux Client

## Runtime boundary

The Linux client is an observability and operator-control surface. On startup it runs a **single simulated** `ResilienceRuntime` cycle using read-only Linux diagnostics (`ip` and `resolvectl`). This proves the client enters the canonical runtime path while preserving the safe default: it does not mutate host networking.

`GET /health` exposes the runtime snapshot and registered capabilities. `GET /` renders the same canonical runtime status alongside diagnostics. Changes to the client policy UI do not independently execute routing, DNS, gateway, tunnel, or failover changes; any future mutation must be submitted to `ResilienceRuntime` and pass its policy, safety, transaction, and verification boundaries.

## Verification

Run the package checks from the repository root:

```sh
pnpm --filter @irp/linux-client typecheck
pnpm --filter @irp/linux-client lint
pnpm --filter @irp/linux-client test
pnpm --filter @irp/linux-client build
```
