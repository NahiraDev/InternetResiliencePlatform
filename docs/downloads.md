# IRP Downloads

Internet Resilience Platform client downloads are published on GitHub Releases.

## Latest release

**[Open the latest IRP Release](https://github.com/NahiraDev/InternetResiliencePlatform/releases/latest)**

Choose the asset matching your platform:

| Platform | Asset | Install/use |
|---|---|---|
| Android | `IRP-Android-debug.apk` | Download the APK to the Android device and install it. Development/test installation may require allowing installation from the source used to obtain the APK. |
| Linux | `IRP-Linux-*.tar.gz` | Extract the bundle and run the packaged Linux client according to the included README/operational contract. |
| macOS | `IRP-macOS-*.tar.gz` | Extract the bundle and follow the included macOS client/launchd instructions. |
| Windows | `IRP-Windows-*.zip` | Extract the bundle and follow the included Windows client instructions. |
| iPhone / iPad | `IRP-iOS-source-*.zip` | **Developer/source bundle only.** An installable iOS `.ipa` is not published until Apple signing/provisioning is configured. |

## Important

GitHub Releases are the distribution surface; the repository source tree is not presented as an end-user installer.

An artifact is only called installable when the repository can actually produce the required platform package. In particular, iOS device installation requires Apple signing/provisioning and is intentionally kept separate from the unsigned source build.

## For maintainers

Create a version tag such as `v1.0.0` after the applicable release gates are satisfied. The release workflow builds the supported platform bundles and attaches them to the corresponding GitHub Release.
