# DNS Diagnostics

Shows the information available from the DNS provider without changing DNS settings.

## Run

```bash
pnpm build
node examples/dns-diagnostics/inspect.mjs example.com
```

Use this example to understand the difference between DNS observation and DNS configuration. The example never changes `/etc/resolv.conf`, systemd-resolved, router configuration, or application resolver settings.
