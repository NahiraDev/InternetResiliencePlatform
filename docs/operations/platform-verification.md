# Platform verification status

Only claims backed by a run are marked **Verified**. "Verified" means exercised in the environment
named in the evidence column, not on every distribution.

| Capability | Linux | Windows | macOS | Android | iOS |
| --- | --- | --- | --- | --- | --- |
| Host network snapshot (interfaces/routes/DNS) | **Verified** (daemon discovers `eth0` via `ip -j`) | Code only: wraps `ipconfig`/`route`/`netsh`; never run on Windows | Code only: wraps `ifconfig`/`route`/`scutil`; never run on macOS | Source only | Source only |
| Route change + verification + rollback | **Verified** with real kernel routes in a network namespace (root, iproute2) | Unsupported (no implementation) | Unsupported (no implementation) | Unsupported | Unsupported |
| Crash recovery of interrupted route change | **Verified** (journal + restart tests, real kernel) | Unsupported | Unsupported | Unsupported | Unsupported |
| Durable decisions/incidents across restart | **Verified** (daemon restart test) | Not integrated with the daemon | Not integrated | n/a | n/a |
| DNS switch + restore of original resolvers | Logic unit-tested with a fake `resolvectl`; **not run against real systemd-resolved** | Unsupported | Unsupported | Unsupported | Unsupported |
| Daemon + CLI control socket | **Verified** (real processes) | Unsupported (Unix socket daemon) | Not tested | n/a | n/a |
| systemd unit | Written; **not started under systemd** here (no systemd in the test sandbox) | n/a | n/a | n/a | n/a |
| Tunnel/VPN client | Not verified | Not verified | Not verified | Not built: no Android SDK in the test environment | Not built: no Swift toolchain |

Windows and macOS packages are unit-tested on Linux only; those tests cover the non-Windows/macOS
fallback and HTML rendering, not the real system commands. Android and iOS clients were not built or
tested in this session.
