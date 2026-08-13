# Phase 19 Demo

Build the package, then run:

```bash
pnpm --filter @irp/network-intelligence build
pnpm phase19-demo -- examples/phase-19/tunnel-failure.json
```

The demo is simulation-only and writes `examples/phase-19/phase19-result.json`. It prints scenario, selected candidate, score, confidence, status, and result path. It does not modify host routes, DNS, tunnels, interfaces, firewall, or recovery state.
