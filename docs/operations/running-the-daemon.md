# Running the IRP daemon on Linux

The daemon (`apps/daemon`) hosts `ResilienceRuntime`, the single production authority for network
mutation. The `irp` CLI is a client of that running daemon: it never builds its own runtime.

## Install

Requirements: Linux, Node.js, pnpm, iproute2 (`ip`). `systemd-resolved` (`resolvectl`) is needed only
for live DNS switching.

```bash
pnpm install --frozen-lockfile && pnpm build
sudo scripts/install-linux.sh          # /opt/irp, /usr/local/bin/irp, systemd unit, irp user, /etc/irp/irp.env
sudo systemctl enable --now irp-daemon
sudo irp status
```

Without systemd: `IRP_STATE_DIR=$HOME/.irp IRP_CONTROL_SOCKET=$HOME/.irp/irp.sock node apps/daemon/dist/index.js`.

## Modes

| `IRP_RUNTIME_MODE` | Behaviour |
| --- | --- |
| `safe` (default) | Observes the host, decides, records decisions and incidents. Never changes routes or DNS. |
| `simulation` | Same, decisions marked simulated. |
| `live` | May apply route/DNS changes. Refused at startup unless `IRP_ENABLE_LIVE_ROUTE_MUTATION=true` is also set. Needs `CAP_NET_ADMIN`. |

`IRP_RUNTIME_ENABLED=1` starts the periodic 30 s cycle; otherwise cycles run when requested.
Live mode can never be requested over the control socket or from the CLI.

## State and recovery

State lives in `IRP_STATE_DIR` (`/var/lib/irp` for the service): `decisions.jsonl`, `incidents.jsonl`,
`route-journal/` and `dns-original.json`. On start the daemon rolls back any route change that was
issued but never verified (crash during mutation) and restores resolvers it had replaced. On
shutdown it restores the original resolvers.

## Control channel

A Unix socket (`/run/irp/irp.sock`, mode 0600, directory 0700). Filesystem permissions are the only
authentication, so use `sudo irp …` or run as the `irp` user. There is no TCP control port.

```bash
irp status | irp doctor
irp runtime snapshot | decisions | incidents | capabilities
irp runtime cycle [--simulate]
```

If no daemon is listening, commands print the reason and exit non-zero.
