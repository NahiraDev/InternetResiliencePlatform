# Linux End-User Install and Operation Guide (Debian 13)

> **Status:** Developer-preview / prerelease. **Not production-certified.**
>
> This guide is for a careful operator who wants to install the IRP daemon on Debian 13 (trixie) and use it for network observation plus safe, bounded, verified route recovery. Read the limitations before enabling live mode.

## What you can do today

1. Install the daemon and CLI via the Debian package (`irp-daemon_0.2.6_amd64.deb`) or from a built source checkout.
2. Start and stop the service via systemd as the dedicated non-root `irp` user.
3. Read honest status that distinguishes live vs safe mode and lists every blocker.
4. Observe network conditions.
5. When live mode is explicitly opted in and host facts allow it, apply only bounded route changes that go through verify and rollback.

## What the system will not do automatically

- It will never mutate routes or DNS unless you set both `IRP_RUNTIME_MODE=live` and `IRP_ENABLE_LIVE_ROUTE_MUTATION=true` in `/etc/irp/irp.env` and restart the service.
- Even then, live route mutation is granted only when the process is on Linux, holds `CAP_NET_ADMIN`, and `ip` is on PATH.
- **DNS write is disabled under `User=irp`.** The capability additionally requires root (`euid === 0`) and `resolvectl`. The daemon reports this as a blocker and does not pretend the capability exists.
- There is no second control plane. All mutation goes through `@irp/resilience-runtime` and `PrivilegedMutationBoundary`.

## Install

### Option A — Debian package (recommended for end users)

```bash
# After obtaining the release artifact and its .sha256
sha256sum -c irp-daemon_0.2.6_amd64.deb.sha256
sudo dpkg -i irp-daemon_0.2.6_amd64.deb
sudo systemctl start irp-daemon
sudo irp status
```

The package creates the `irp` user/group, installs `/etc/irp/irp.env` from the example (safe defaults), and enables the unit. Build it yourself with `scripts/build-linux-daemon-deb.sh` (requires Node.js >= 24, pnpm, and a prior `pnpm install --frozen-lockfile`).

### Option B — From a source checkout

Requirements: Debian 13, Node.js >= 24, pnpm, `iproute2`, and (optional) `systemd-resolved` if you later want DNS experiments as root.

```bash
git clone https://github.com/NahiraDev/InternetResiliencePlatform.git
cd InternetResiliencePlatform
pnpm install --frozen-lockfile
pnpm build
sudo scripts/install-linux.sh
sudo systemctl enable --now irp-daemon
sudo irp status
```

Without systemd: `IRP_STATE_DIR=$HOME/.irp IRP_CONTROL_SOCKET=$HOME/.irp/irp.sock node apps/daemon/dist/index.js`.

## Start / stop / status

```bash
sudo systemctl status irp-daemon
sudo systemctl start irp-daemon
sudo systemctl stop irp-daemon
sudo systemctl restart irp-daemon
sudo irp status
sudo irp doctor
```

`irp status` and `irp doctor` exit non-zero when the daemon is unreachable or when evidence is incomplete.

## Configuration (`/etc/irp/irp.env`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `IRP_RUNTIME_MODE` | `safe` | `safe` / `simulation` / `live`. Live is refused unless the next variable is also set. |
| `IRP_ENABLE_LIVE_ROUTE_MUTATION` | unset | Must be exactly `true` for live route mutation. |
| `IRP_RUNTIME_ENABLED` | `1` | Run the periodic 30 s cycle. |

After editing, `sudo systemctl restart irp-daemon`.

## What the system will and will not do

| Capability | Granted when |
| --- | --- |
| `network.observe` | Always |
| `route.write`, `connectivity.failover` | Linux + `CAP_NET_ADMIN` + `ip` on PATH + both live opt-ins above |
| `dns.write` | All of the above **plus** root (`euid === 0`) and `resolvectl` |

Under the shipped unit (`User=irp`), DNS write is never granted and appears in `authorization.blockers`.

Mutation authority is exclusively `@irp/resilience-runtime` + `PrivilegedMutationBoundary`. The CLI and control socket can only request safe/simulation cycles; live mutation cannot be enabled from the socket.

## Current limitations (do not ignore)

- DNS write under `User=irp` is disabled by design.
- No production soak evidence yet (Linux runtime soak #323).
- PostgreSQL stores exist but production deployment evidence is incomplete (#410/#411).
- exact-SHA CI / release-gate evidence is still pending for phases 94–150.
- This is a prerelease. Do not treat it as production-certified.

## Uninstall

```bash
sudo systemctl stop irp-daemon
sudo dpkg -r irp-daemon
# or, for a source install:
sudo systemctl disable --now irp-daemon
sudo rm -rf /opt/irp /etc/irp /usr/local/bin/irp
sudo userdel irp  # if you created it
```

State under `/var/lib/irp` is left in place unless you remove it explicitly.
