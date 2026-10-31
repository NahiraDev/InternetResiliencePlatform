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

## What the daemon is authorized to do

Trust is derived by the daemon itself, never supplied by a caller. It is the intersection of the
operator's request and facts probed from the host:

| Granted | Requires |
| --- | --- |
| `network.observe` (always) | nothing |
| `route.write`, `connectivity.failover` | `IRP_RUNTIME_MODE=live` **and** `IRP_ENABLE_LIVE_ROUTE_MUTATION=true`, Linux, `CAP_NET_ADMIN` in the process's effective set (read from `/proc/self/status`), `ip` on `PATH` |
| `dns.write` | all of the above, plus root and `resolvectl` on `PATH` |

If live is requested but something is missing, the daemon runs observe-only (`effectiveMode: safe`)
and lists each missing requirement under `authorization.blockers`. Mutation authority applies to
`live` cycles only: a `safe` or `simulation` cycle, which is all the socket or CLI can request,
never mutates even on a live-authorized host. An adapter that merely declares `supportsLive` is
reported as `host-blocked` until the host grants every privileged capability it needs.

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

`irp status` and `irp doctor` report `healthy` only with positive evidence; otherwise `degraded`,
`unknown`, `blocked` (with the policy's exact reasons) or `unreachable`. Exit codes:

| Code | Meaning |
| --- | --- |
| 0 | healthy |
| 1 | error / bad usage |
| 2 | degraded or unknown (no verified healthy evidence, volatile state, live requested but not authorized, restore pending) |
| 3 | daemon unreachable |
| 4 | the latest decision was blocked |

`irp runtime decisions` shows per decision whether it was blocked (and why), simulated, executed,
and whether the execution was verified; `--raw` prints full records. Diagnostics only read.

On SIGTERM the daemon stops accepting requests, lets a running cycle reach verification, then
restores any resolvers it replaced. A second request while a cycle runs gets HTTP 409.
