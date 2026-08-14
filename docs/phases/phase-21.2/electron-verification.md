# Phase 21.2 Electron Verification

## Environment

- OS: Ubuntu 24.04.4 LTS.
- Node: v20.20.2, which violates the repository requirement of Node >=22.0.0.
- pnpm: 9.15.0.
- Initial `ldd` showed missing Electron shared libraries: `libatk-1.0.so.0`, `libatk-bridge-2.0.so.0`, `libcups.so.2`, `libgtk-3.so.0`, `libXcomposite.so.1`, `libXdamage.so.1`, `libXfixes.so.3`, `libXrandr.so.2`, `libgbm.so.1`, `libxkbcommon.so.0`, `libasound.so.2`, and `libatspi.so.0`.
- Added OS packages through `apt-get`: `libatk1.0-0t64`, `libatk-bridge2.0-0t64`, `libcups2t64`, `libgtk-3-0t64`, `libxcomposite1`, `libxdamage1`, `libxfixes3`, `libxrandr2`, `libgbm1`, `libxkbcommon0`, `libasound2t64`, `libatspi2.0-0t64`, and `xvfb` plus apt dependencies.

## Startup

- Before OS packages: `pnpm --dir apps/desktop dev` failed before Electron main startup with `libatk-1.0.so.0` missing.
- After OS packages: `ldd` had no missing libraries.
- `pnpm --dir apps/desktop dev` under Xvfb then failed because the container runs as root and Chromium/Electron refuses root without `--no-sandbox`.
- Smoke verification command used `IRP_ELECTRON_SMOKE_TEST=1 timeout 20s xvfb-run -a pnpm exec electron . --no-sandbox --demo healthy` from `apps/desktop`; it logged `Desktop app started` and exited cleanly.

## Main, Preload, Renderer, IPC, and Security

- Main process creates a `BrowserWindow`, registers IPC, applies CSP headers, blocks unapproved navigation, and denies popups.
- Preload uses `contextBridge.exposeInMainWorld('platform', platform)` and does not expose raw `ipcRenderer`.
- Security posture remains `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and `webSecurity: true`; no code weakened those settings.
- IPC handlers use the existing registered channel allowlist and `validateRequest()` before invoking handlers.
- Runtime IPC/page verification remains PARTIAL because the desktop currently serves DEMO data and is not wired to the live backend.

## Pages

| Page      | Status  | Evidence                                                                    |
| --------- | ------- | --------------------------------------------------------------------------- |
| Dashboard | PARTIAL | Renderer can load in smoke startup, but live backend data was not verified. |
| Network   | PARTIAL | Demo IPC path exists; live backend network state not connected.             |
| Security  | PARTIAL | Demo IPC path exists; live backend security state not connected.            |
| Tunnels   | PARTIAL | Demo IPC path exists; no real tunnel provider verified.                     |
| DNS       | PARTIAL | Demo IPC path exists; secure DNS runtime not connected.                     |
| Decisions | PARTIAL | Demo IPC path exists; live AI decision context not connected.               |
| Settings  | PARTIAL | Demo settings IPC path exists.                                              |

## Shutdown

Smoke mode quits through `app.quit()` after startup. Timeout-based forced shutdown without smoke can produce Electron fatal shutdown in this root/Xvfb environment.
