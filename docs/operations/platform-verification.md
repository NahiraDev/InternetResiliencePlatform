# Platform verification status

Only claims backed by a run are marked **Verified**. "Verified" means exercised in the environment
named in the evidence column, not on every distribution.

| Capability | Linux | Windows | macOS | Android | iOS |
| --- | --- | --- | --- | --- | --- |
| Host network snapshot (interfaces/routes/DNS) | **Verified** (daemon discovers `eth0` via `ip -j`) | Code only: real IP Helper API (`iphlpapi.dll`) FFI bindings via `node-ffi-napi`; privilege-gated; **never run on Windows** | Code only: real SystemConfiguration framework FFI bindings; privilege-gated; **never run on macOS** | Source only: `HttpControlPlaneClient` + `AndroidKeyStoreTokenStore` + `VpnService`; **not built** (no Android SDK) | Source only: `HttpControlPlaneClient` + `IRPKeychainTokenStore` + `NETunnelProviderManager`; **not built** (no Xcode) |
| Route change + verification + rollback | **Verified** with real kernel routes in a network namespace (root, iproute2) | Code only: `CreateIpForwardEntry`/`DeleteIpForwardEntry` + apply→verify→rollback transaction; **not run on Windows** | Not implemented via SystemConfiguration mutation path; **not run on macOS** | Unsupported | Unsupported |
| Crash recovery of interrupted route change | **Verified** (journal + restart tests, real kernel) | Unsupported | Unsupported | Unsupported | Unsupported |
| Durable decisions/incidents across restart | **Verified** (daemon restart test) | Not integrated with the daemon | Not integrated | n/a | n/a |
| DNS switch + restore of original resolvers | Logic unit-tested with a fake `resolvectl`; **not run against real systemd-resolved** | Unsupported | Unsupported | Unsupported | Unsupported |
| Daemon + CLI control socket | **Verified** (real processes) | Unsupported (Unix socket daemon) | Not tested | n/a | n/a |
| Host-derived trust (CAP_NET_ADMIN, iproute2, uid) | **Verified**: real daemon processes, with and without `CAP_NET_ADMIN` (`setpriv`) | Code only: `IsUserAnAdmin` / token-elevation via FFI; **not run on Windows** | Code only: `euid == 0` root check via FFI; **not run on macOS** | n/a | n/a |
| Local HTTP control (`POST /policy`) | **Verified** (loopback, Host/Origin, JSON, bearer token; tests send real HTTP) | n/a | Same guard, tested on Linux only | n/a | n/a |
| Shutdown drains an in-flight cycle | **Verified** for a safe-mode cycle; not exercised with a live mutation in flight | n/a | n/a | n/a | n/a |
| Live cycle through runtime → authorizer → adapter → real kernel in one run | **Not verified.** Each stage is tested separately (runtime/authorizer with a test adapter; executor against the real kernel in a netns) | n/a | n/a | n/a | n/a |
| systemd unit | Written; **not started under systemd** here (no systemd in the test sandbox) | n/a | n/a | n/a | n/a |
| Tunnel/VPN client | Not verified | Not verified | Not verified | Not built: no Android SDK in the test environment | Not built: no Swift toolchain |
| Control Plane endpoint configuration | Configured via `IRP_DESTINATION_IP` env | n/a | n/a | **Fixed**: endpoint read from `res/values/strings.xml`; no localhost default; fail-closed | **Fixed**: endpoint read from `Info.plist` `IRPControlPlaneBaseURL`; HTTPS required in production; localhost only in DEBUG; fail-closed |

Windows and macOS packages are unit-tested on Linux only; those tests cover the FFI binding structure, privilege detection, credential storage, and honest capability reporting, not the real system commands. Android and iOS clients were not built or tested in this session (no Android SDK / Xcode toolchain available). The iOS and Android Control Plane endpoint defaults to `http://127.0.0.1:3000` have been removed; both now require explicit configuration and fail closed when unconfigured.
