# Extensibility

IRP is designed as a modular platform. Extension points must preserve the platform's safety and observability boundaries.

## Extension types

The repository contains package-level abstractions for providers, plugins, probes, events, and runtime capabilities. The exact supported lifecycle is defined by the corresponding implementation and tests.

## Extension requirements

A new extension should define:

- ownership and responsibility;
- input/output contract;
- configuration;
- lifecycle;
- failure behavior;
- security boundary;
- observability;
- test strategy;
- cleanup and shutdown behavior.

## Providers

Providers encapsulate external or platform-specific mechanisms behind typed contracts. A provider should not silently bypass policy or execute arbitrary commands outside its defined capability.

## Plugins

Plugins must be isolated according to their supported runtime model. Registration, loading, configuration, lifecycle, and failure behavior must remain explicit.

## Documentation rule

Do not document an extension point as production-ready solely because an interface exists. Link documentation to an implementation and verification path.
