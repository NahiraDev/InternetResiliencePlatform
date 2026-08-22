# Autopilot Decision Loop

Demonstrates the safe shape of the Network Autopilot loop without performing a host mutation.

```text
Observe → Measure → Detect → Diagnose → Decide
→ Policy/Safety Check → Plan → Apply → Verify
→ Rollback/Recovery → Telemetry
```

The example stops before `Apply`. This makes the decision boundary explicit and keeps the example safe and reproducible.

## Run

```bash
pnpm build
node examples/autopilot/simulate.mjs
```

The output shows the evidence, decision, policy gate, and the fact that no mutation was applied.
