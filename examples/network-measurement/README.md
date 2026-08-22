# Network Measurement

Demonstrates a bounded DNS observation using the public network-intelligence provider interface.

## Run

Build the workspace first:

```bash
pnpm build
node examples/network-measurement/measure-dns.mjs example.com
```

The example performs observation only. It does not alter resolver configuration or system networking.
