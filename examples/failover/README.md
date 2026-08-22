# Failover Decision Simulation

Demonstrates candidate evaluation without changing the host network.

The example models two connectivity candidates and asks the network decision engine to select the safer candidate. It is a simulation: no route, DNS, tunnel, or interface changes are applied.

## Run

```bash
pnpm build
node examples/failover/simulate.mjs
```

Use this example to understand decision output before integrating a real provider/action layer.
