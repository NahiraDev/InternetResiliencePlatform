# Extensibility

IRP is designed as a modular platform. Extension points must preserve the platform's safety, lifecycle, and observability boundaries.

## Extension model

The repository contains package-level abstractions for providers, plugins, probes, events, and runtime capabilities. An abstraction is not by itself evidence that the corresponding production integration is complete.

## Plugin model

The plugin architecture uses a typed manifest and capability-oriented permissions. The intended lifecycle is:

```text
Install → Validate → Resolve → Load → Initialize → Activate
                                         ↓
                              Suspend / Resume / Reload
                                         ↓
                               Disable / Uninstall
```

Plugin metadata can describe identity/version, compatibility, dependencies, entrypoint, activation events, configuration, capabilities, signature/checksum information, and permissions where supported by the implementation.

## Capability security

Permissions should be explicit and least-privilege. Examples include read-only network access, DNS modification, configuration access, metrics export, and plugin management. A plugin must not receive capabilities it did not request and is not authorized to use.

## Providers

Providers encapsulate external or platform-specific mechanisms behind typed contracts. A provider must not bypass policy or execute arbitrary actions outside its defined capability.

## Extension requirements

A new extension should define:

- responsibility and ownership;
- input/output contract;
- configuration;
- lifecycle;
- dependencies;
- failure behavior;
- security boundary;
- observability;
- tests;
- cleanup/shutdown behavior.

## Production status

Plugin or provider interfaces must not be documented as production-ready merely because the interface exists. Capability status must be verified against the implementation, integration tests, and `PROJECT_STATE.md`.
