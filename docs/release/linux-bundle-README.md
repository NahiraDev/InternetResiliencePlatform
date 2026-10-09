# IRP Linux Client Bundle

Internet Resilience Platform — Linux client bundle (v0.2.x developer preview).

This is a runnable pnpm mini-workspace: the built Linux client plus every
transitive `@irp` workspace package it needs, with a lockfile pinned to the
exact external dependency versions the repository CI tested.

## Prerequisites

- Node.js >= 24
- pnpm >= 11.21.0
- Network access to the npm registry (dependencies are not vendored)

## Install

```bash
pnpm install --frozen-lockfile
```

The install is reproducible: the lockfile is part of the bundle and the
resolution was verified against the repository's own lockfile at packaging
time.

## Start

```bash
node packages/linux-client/dist/main.js
```

The client listens on `127.0.0.1:17861` and serves:

- `GET /health` — runtime status as JSON
- `GET /` — human-readable status page
- `POST /policy` — toggle autonomous mode (`autonomousMode=true|false`)

The default execution mode is **simulation**: the full canonical runtime path
(observe → decide → apply → verify) is exercised without mutating host
networking. Live network control requires `IRP_EXECUTION_MODE=real`; live
route mutation additionally requires `CAP_NET_ADMIN` and fails closed at the
kernel executor boundary without it.

## Stop

Send `SIGTERM` or `SIGINT` to the process (Ctrl+C in a foreground shell).

## Uninstall

Delete the extracted bundle directory. No system services, packages, or
configuration are installed by this bundle.

## Integrity and licenses

Verify the archive against the release's `SHA256SUMS.txt` before use. The
repository `LICENSE` is included; third-party dependency licenses are
declared in each dependency's own manifest inside `node_modules` after
installation.

## Limitations (developer preview)

- This bundle proves install, startup and health behavior. It is not a
  production-certified distribution; see the release notes and the
  repository's release roadmap for the outstanding certification evidence.
