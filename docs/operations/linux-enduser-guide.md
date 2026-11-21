# Linux End-User Install and Operation Guide (Debian 13)

> **Status:** Developer-preview / prerelease. **Not production-certified.**
>
> This guide is for a careful operator who wants to install the IRP daemon on Debian 13 (trixie) and use it for network observation plus safe, bounded, verified route recovery. Read the limitations before enabling live mode.

## What you can do today

1. Install the daemon and CLI from a built checkout (or a future Debian package).
2. Start and stop the service via systemd as the dedicated non-root `irp` user.
3. Read honest status that distinguishes live vs safe mode and lists every blocker.
4. Observe network conditions.
5. When live mode is explicitly opted in and host facts allow it, apply only bounded route changes that go through verify and rollback.

## What the system will not do automatically

- It will never mutate routes or DNS unless you set both `IRP_RUNTIME_MODE=live` and `IRP_ENABLE_LIVE_ROUTE_MUTATION=true` in `/etc/irp/irp.env` and restart the service.
- Even then, live route mutation is granted only when the process is on Linux, holds `CAP_NET_ADMIN`, and `ip` is on PATH.
- **DNS write is disabled under `User=irp`.** The capability additionally requires root (`euid === 0`) and `resolvectl`. The daemon reports this as a blocker and does not pretend the capability exists.
- There is no second control plane. All mutation goes through `@irp/resilience-runtime` and `PrivilegedMutationBoundary`.

## Install (from source checkout)

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

The install script creates the `irp` system user, installs the unit to `/etc/systemd/system/irp-daemon.service`, and places an example environment at `/etc/irp/irp.env` if one does not already exist.

## Start / stop / status

```bash
sudo systemctl start irp-daemon
sudo systemctl stop irp-daemon
sudo systemctl status irp-daemon
sudo irp status          # or: irp doctor
sudo irp runtime snapshot
sudo irp runtime decisions
```

`irp status` exits non-zero when the daemon is unreachable, degraded, or blocked. Look at `authorization.blockers` for the exact reasons live mode is not active.

## Modes

| Variable | Default | Effect |
|----------|---------|--------|
| `IRP_RUNTIME_MODE` | `safe` | `safe` = observe only; `live` = may mutate if host also allows |
| `IRP_ENABLE_LIVE_ROUTE_MUTATION` | unset | Must be `true` together with live mode |
| `IRP_RUNTIME_ENABLED` | `1` | Periodic 30 s cycle; otherwise cycles only on request |

Edit `/etc/irp/irp.env` and restart the service after any change. Live mode cannot be requested over the control socket.

## Current limitations (honest)

- **DNS write under the service account is off.** Documented fail-closed behaviour. Do not assume DNS switching works when running as `User=irp`.
- No production soak evidence yet (see issue #323).
- PostgreSQL durable stores exist in code but production deployment evidence is still incomplete (#410/#411).
- Exact-SHA CI / Release Gate on the tagged commit is still required before any stronger claim.
- Mobile and desktop clients are secondary; Linux is the release gate.

## Package build (for maintainers)

```bash
pnpm linux:package          # produces dist/linux/irp-linux-client_0.2.5_amd64.deb + .sha256
```

The package is still a prerelease artifact. Verify checksums before distributing.

## Recovery and safety

On startup the daemon rolls back any route change that was issued but never verified. On shutdown it restores any resolvers it had replaced. All live mutations are journaled and verified.

If anything looks wrong, stop the service:

```bash
sudo systemctl stop irp-daemon
```

The unit uses `ProtectSystem=strict`, `NoNewPrivileges=true`, and only `CAP_NET_ADMIN`.

---

For the full operational contract see `docs/operations/running-the-daemon.md` and `docs/release/linux-primary-platform.md`.
