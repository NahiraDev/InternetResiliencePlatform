# Platform Support

IRP is designed as a cross-platform product, but capability availability depends on the host operating system and the implementation stage of the relevant phase.

## Support model

| Surface | Role | Source of truth |
| --- | --- | --- |
| Linux | Full client / runtime | Linux adapter + Core |
| macOS | Full client / runtime | macOS adapter + Core |
| Windows | Full client / runtime | Windows adapter + Core |
| iOS | Full client | iOS adapter + shared API |
| Android | Full client | Android adapter + shared API |
| Web | Control center | Versioned product API |
| Server | Control plane / gateway / probe | Server runtime |

## Capability states

A platform capability must be classified as `supported`, `limited`, `planned`, or `unsupported`. Never infer support from the existence of a shared TypeScript interface.

## Native networking

Desktop and mobile operating systems expose different networking primitives and permissions. Platform adapters must document required entitlements, services, lifecycle behavior and limitations. The shared Core must remain platform-neutral.

## Verification

Platform support becomes a release claim only after the relevant platform tests, lifecycle tests, security checks and runtime evidence pass the phase release gate.
