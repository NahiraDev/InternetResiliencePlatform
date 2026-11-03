# Cross-Platform Control Plane Integration — Trace & Gap Report

## Platform Execution Paths

### 1. Web
```
Browser → SDK (InternetResilienceClient) → fetch API → API endpoints
                                                      → ResilienceRuntime → policy/execution → persistence → response
```
- **Status**: Real integration
- **Authentication**: Bearer token via `accessToken` option
- **State**: No local state mutation; all through API
- **Capabilities**: health, version, capabilities, context, device snapshot/analytics/policy, remote client auth
- **Notes**: Uses the shared SDK; no local runtime

### 2. CLI
```
Terminal → irp CLI → Unix control socket → daemon ControlServer → ResilienceRuntime
                                                      → policy/execution → persistence → response
```
- **Status**: Real integration
- **Authentication**: Unix socket filesystem permissions (0600 socket, 0700 directory)
- **State**: No local state mutation; all through daemon
- **Capabilities**: status, snapshot, decisions, incidents, capabilities, cycle (safe/simulation only), reload
- **Notes**: Live mode refused by design; daemon controls its own mode

### 3. SDK
```
Application code → InternetResilienceClient → fetch → API → ResilienceRuntime → response
```
- **Status**: Real integration (library)
- **Authentication**: Bearer token via `accessToken` option
- **Capabilities**: health, version, capabilities, context, device snapshot/analytics/policy, setDevicePolicy, remoteClientToken, remoteClientRefresh
- **Notes**: Typed client for web/desktop/mobile; no local runtime

### 4. Linux
```
Local process → ResilienceRuntime (in-process) → CanonicalNetworkControlPlane
                                                      → KernelRuntime → routing contract → Linux route executor
                                                      → kernel → actual network mutation
                                                      → route journal → recovery on crash
```
- **Status**: Real integration (production data plane)
- **Authentication**: Host authorization (CAP_NET_ADMIN, iproute2, resolvectl, uid)
- **State**: Local state directory with route journal and decision store
- **Capabilities**: observation, routing, DNS, tunnel, gateway selection, destination verification
- **Notes**: Live mutation requires `IRP_ENABLE_LIVE_ROUTE_MUTATION=true`; daemon controls mode

### 5. macOS (NEW)
```
Native app → HttpControlPlaneClient → URLSession/fetch → HTTP → API → ResilienceRuntime → response
                                                      → persistence → response
```
- **Status**: Real integration (was diagnostics-only)
- **Authentication**: Device credential → access+refresh token via `/api/v1/auth/remote/token`
- **Token lifecycle**: Auto-refresh on 401 with one retry; secure file storage (0600)
- **Device identity**: deviceId from enrollment credential; ownership enforced on API (`deviceId === token.sub`)
- **Capabilities**: snapshot, analytics, policy GET/POST, enrollment request
- **Notes**: No direct network mutation; all through canonical ResilienceRuntime

### 6. Windows (NEW)
```
Native app → HttpControlPlaneClient → Node fetch → HTTP → API → ResilienceRuntime → response
                                                      → persistence → response
```
- **Status**: Real integration (was diagnostics-only)
- **Authentication**: Device credential → access+refresh token via `/api/v1/auth/remote/token`
- **Token lifecycle**: Auto-refresh on 401 with one retry; secure file storage (0600)
- **Device identity**: deviceId from enrollment credential; ownership enforced on API
- **Capabilities**: snapshot, analytics, policy GET/POST, enrollment request
- **Notes**: No direct network mutation; all through canonical ResilienceRuntime

### 7. Android
```
Native app → HttpControlPlaneClient → HttpURLConnection → HTTP → API → ResilienceRuntime → response
                                                      → persistence → response
```
- **Status**: Real integration (was unconfigured placeholder)
- **Authentication**: Device credential → access+refresh token via `/api/v1/auth/remote/token`
- **Token lifecycle**: Auto-refresh on 401 with one retry; Android KeyStore encrypted storage
- **Device identity**: deviceId from enrollment credential; ownership enforced on API
- **Capabilities**: snapshot, analytics, policy GET/POST, enrollment request
- **Notes**: Coroutine cancellation via bounded timeouts; no direct network mutation

### 8. iOS
```
Native app → HttpControlPlaneClient → URLSession → HTTP → API → ResilienceRuntime → response
                                                      → persistence → response
```
- **Status**: Real integration
- **Authentication**: Device credential → access+refresh token via `/api/v1/auth/remote/token`
- **Token lifecycle**: Auto-refresh on 401 with one retry; iOS Keychain storage
- **Device identity**: deviceId from enrollment credential; ownership enforced on API
- **Capabilities**: snapshot, analytics, policy GET/POST, enrollment request
- **Notes**: No direct network mutation; all through canonical ResilienceRuntime

## Integration Boundaries

| Boundary | Technology | Security Model |
|----------|-----------|----------------|
| Client → API | HTTPS/HTTP with Bearer token | Device-scoped JWT (access 15min, refresh 30days) |
| API → ResilienceRuntime | Direct in-process call | Host trust from daemon configuration |
| ResilienceRuntime → Kernel | CanonicalNetworkControlPlane contract | Capability-based (network.route, network.inspect) |
| Daemon → CLI | Unix domain socket (0600) | Filesystem permissions |

## Device Enrollment Flow (NEW)

```
User → API: POST /auth/remote/devices/request (user token)
                                      → pending enrollment request
Admin → API: GET /auth/remote/devices/requests (admin token)
                                      → list pending requests
Admin → API: POST /auth/remote/devices/requests/:id/approve
                                      → create device credentials → return to user
Device → API: POST /auth/remote/token (credentialId + secret)
                                      → access + refresh tokens
Device → API: GET/POST /remote/devices/:id/{snapshot,analytics,policy}
                                      → device-scoped operations
```

## Duplicated Implementations

1. **HTTP Transport (per platform)**: Kotlin (Android), Swift (iOS), TypeScript (macOS, Windows)
   - **Justification**: Different languages/platforms; cannot share implementation
   - **Consistency**: All follow same API contract, auth flow, timeout values (8s/15s)

2. **Token Storage (per platform)**: Android KeyStore, iOS Keychain, file-based (macOS/Windows)
   - **Justification**: Platform-specific secure storage APIs
   - **Consistency**: All use 0600-equivalent restrictions; refresh token only

3. **Rate Limiting**: Shared PostgreSQL-backed store via `repos.rateLimits`
   - **Consistency**: Single implementation shared by all API endpoints

## Disconnected Capabilities (PREVIOUSLY)

| Capability | Was | Now |
|------------|-----|-----|
| macOS API connection | Diagnostics-only (local ifconfig) | Real HTTP transport to API |
| Windows API connection | None (local ipconfig only) | Real HTTP transport to API |
| Device enrollment | Admin-only pre-provisioning | User-initiated request + admin approval |
| Mobile policy mutation | Not available | Via API → ResilienceRuntime |
| Mobile auth | Unconfigured placeholder | Full credential auth + refresh |

## Security Review

1. **Device ownership**: `requireRemoteClient` enforces `URL.deviceId === token.sub` — 403 on mismatch ✅
2. **Policy authorization**: Policy POST calls `resilienceRuntime.runCycle()` — actual mutation through canonical runtime ✅
3. **Live-mode execution**: Mode ('live'/'safe') is requested by client; daemon controls whether live mutation is permitted via `IRP_ENABLE_LIVE_ROUTE_MUTATION` — no second control plane ✅
4. **Persistence**: Decisions stored via runtime's decision store (file or PostgreSQL) ✅
5. **Token storage**: Refresh tokens at rest with 0600 file permissions; access tokens in memory only ✅
6. **Rate limiting**: Shared PostgreSQL-backed store; fail-closed (503) when store unavailable ✅
7. **Authentication**: Remote clients cannot request enrollment (separate from user auth) ✅
8. **No parallel control plane**: All mobile/desktop clients go through API → ResilienceRuntime ✅

## Architectural Invariants Preserved

- `@irp/resilience-runtime` remains the canonical production control authority ✅
- No second autonomous control plane ✅
- No second policy/safety engine ✅
- No client bypass of canonical mutation boundary ✅
- AI remains advisory only ✅
- Local autonomy survives optional outages ✅

## Remaining Work

1. **Linux runtime soak evidence**: Requires physical/virtual Linux device with CAP_NET_ADMIN (external blocker — #254)
2. **Production PostgreSQL**: Requires managed database provisioning (external blocker — #411)
3. **Release artifacts**: Requires tagged release + CI on exact SHA (external blocker — #323)
4. **Project state reconciliation**: Documentation work (#413 — deferred per instructions)
5. **CodeQL workflow**: CI config (#420 — deferred per instructions)

## Commits on fix/cross-platform-control-plane-integration

1. `623cb0ac` fix(api): wire shared rate-limit store into unified product routes
2. `6a778e32` fix(mobile): repair device data plane auth and transport defects
3. `9371be62` feat(api): add device data plane capabilities to product manifest
4. `126f58d5` feat(sdk): add device control plane and remote client auth methods
5. `646c5ec5` feat(mobile): add HTTP Control Plane transports for Android and iOS
6. `d6155a72` feat(api): add user-initiated device enrollment request flow
7. `0866772c` feat(macos/windows): add HTTP Control Plane transports + enrollment flow

Push to origin blocked by network restrictions (SSH port 22 refused, HTTPS TLS failed).

ResilienceRuntime remains the sole canonical authority throughout all changes.
