# Phase 69 — Cross-Platform Compatibility Matrix

This matrix is a release-engineering contract, not a claim that every runtime combination has already been certified.

| Platform | Client role | Build/CI | Runtime evidence | Upgrade/rollback | Accessibility/localization |
| --- | --- | --- | --- | --- | --- |
| Linux | Full client | Required | Required before certification | Required | Required |
| macOS | Full client | Required | Required before certification | Required | Required |
| Windows | Full client | Required | Required before certification | Required | Required |
| iOS | Full client + Network Extension | Required | Simulator/device evidence required | Required | Required |
| Android | Full client + VPN service | Required | Emulator/device evidence required | Required | Required |
| Core/API | Headless control/data plane | Required | Runtime/container evidence required | Required | N/A |
| Gateway runtime | Managed network provider | Required | Provisioned gateway evidence required | Required | N/A |

## Support policy

- A platform is **supported** only after its build/CI and applicable runtime evidence are green for the release candidate.
- A missing runtime environment is recorded as **not yet evidenced**, never inferred as green.
- Client releases must remain compatible with the shared capability and authorization contracts supported by the target control-plane release.
- Native networking permissions and OS lifecycle rules are platform-specific and must not be emulated by another client.

## Release candidate evidence

| Evidence | Owner | Required |
| --- | --- | --- |
| Repository validation/typecheck/lint/tests/build | CI | Yes |
| Dependency/security audit | CI + release review | Yes |
| Android emulator + VPN lifecycle | Android CI/runtime lab | Yes |
| iOS simulator/device + Network Extension lifecycle | iOS CI/runtime lab | Yes |
| Linux/macOS/Windows runtime smoke | Platform CI/runtime lab | Yes |
| Control-plane container startup/readiness/stability | Runtime lab | Yes |
| Backup/restore round trip | Release engineering | Yes |
| Upgrade/rollback rehearsal | Release engineering | Yes |
| Bounded chaos/soak | Test verification | Yes |

## Versioning rule

Compatibility decisions belong to the release manifest and phase evidence, not to individual UI implementations. Protocol/storage values must be locale-neutral and stable across platform locale settings.
