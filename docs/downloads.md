# IRP Downloads

Internet Resilience Platform client downloads are published on GitHub Releases.

## Latest release

**[Open the latest IRP Release](https://github.com/NahiraDev/InternetResiliencePlatform/releases/latest)**

Choose the asset matching your platform:

| Platform      | Asset                     | Install/use                                                                                                                                                    |
| ------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android       | `IRP-Android-debug-*.apk` | Download the APK to the Android device and install it. Development/test installation may require allowing installation from the source used to obtain the APK. |
| Linux         | `IRP-Linux-*.tar.gz`      | Extract the bundle and run the packaged Linux client according to the included README/operational contract.                                                    |
| macOS         | `IRP-macOS-*.tar.gz`      | Extract the bundle and follow the included macOS client/launchd instructions.                                                                                  |
| Windows       | `IRP-Windows-*.zip`       | Extract the bundle and follow the included Windows client instructions.                                                                                        |
| iPhone / iPad | `IRP-iOS-source-*.zip`    | **Developer/source bundle only.** An installable iOS `.ipa` is not published until Apple signing/provisioning is configured.                                   |

## Important

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
