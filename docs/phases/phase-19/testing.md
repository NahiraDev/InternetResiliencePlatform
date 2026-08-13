# Phase 19 Testing

Focused test command:

```bash
pnpm --filter @irp/network-intelligence test
```

Quality-gate commands used for Phase 19:

```bash
pnpm --filter @irp/network-intelligence typecheck
pnpm --filter @irp/network-intelligence lint
pnpm --filter @irp/network-intelligence build
pnpm --filter @irp/network-intelligence test
pnpm phase19-demo -- examples/phase-19/tunnel-failure.json
node -e "JSON.parse(require('fs').readFileSync('examples/phase-19/phase19-result.json','utf8'))"
```
