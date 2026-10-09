# IRP Downloads

Internet Resilience Platform client downloads are published on GitHub Releases.

## Latest release

**[IRP Releases](https://github.com/nimarahimloo/InternetResiliencePlatform/releases)** (both published releases are developer previews, so `/releases/latest` does not resolve yet)

Choose the asset matching your platform:

| Platform      | Asset                     | Install/use                                                                                                                                                    |
| ------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android       | `IRP-Android-debug-*.apk` | Download the APK to the Android device and install it. Development/test installation may require allowing installation from the source used to obtain the APK. |
| Linux         | `IRP-Linux-*.tar.gz`      | Requires Node.js >= 24, pnpm >= 11.21.0 and npm registry access. Extract the bundle, run `pnpm install --frozen-lockfile` inside it (downloads the locked runtime dependencies), then start the client with `node packages/linux-client/dist/main.js`. It serves a status/health endpoint on `http://127.0.0.1:17861/health`. Default mode is simulation; set `IRP_EXECUTION_MODE=real` for live network control. |
| macOS         | `IRP-macOS-*.tar.gz`      | Developer bundle: built client (`dist/`) plus its `launchd` unit (`launchd/com.nahiradev.irp.macos-client.plist`). Requires Node.js >= 24 on the target machine. |
| Windows       | `IRP-Windows-*.zip`       | Developer bundle: built client (`dist/`) plus `package.json`. Requires Node.js >= 24 on the target machine. |
| iPhone / iPad | `IRP-iOS-source-*.zip`    | **Developer/source bundle only.** An installable iOS `.ipa` is not published until Apple signing/provisioning is configured.                                   |

## Important

The v0.2.x releases are developer previews: the Linux bundle is a reproducible, frozen-dependency developer distribution, the macOS/Windows archives are built-client developer bundles (not signed installers), the Android asset is a debug APK, and the iOS asset is a source/developer bundle only. Production certification evidence (device tests, signed Android builds, regional validation) is tracked in the release roadmap and issue #3.

GitHub Releases are the distribution surface; the repository source tree is not presented as an end-user installer.

An artifact is only called installable when the repository can actually produce the required platform package. In particular, iOS device installation requires Apple signing/provisioning and is intentionally kept separate from the unsigned source build.

## Verify your download

Every release includes a `SHA256SUMS.txt` file covering all published assets. Download it next to the asset you chose and verify it before installing or running anything:

```bash
sha256sum --check --ignore-missing SHA256SUMS.txt
```

On macOS use `shasum -a 256 <file>`; on Windows use `Get-FileHash -Algorithm SHA256 <file>` and compare the result with the matching line in `SHA256SUMS.txt`.

## For maintainers

Create a version tag such as `v1.0.0` only after the `Release Gate` workflow has passed for the exact commit being tagged. The `IRP Release` workflow re-checks this, builds the supported platform bundles, validates them against `ops/release/phase-71-release.json`, generates and verifies `SHA256SUMS.txt`, and attaches everything to the corresponding GitHub Release. The workflow fails closed: if any platform build or the Release Gate check fails, no release is created.
