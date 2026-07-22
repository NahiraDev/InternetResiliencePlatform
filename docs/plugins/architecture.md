# Plugin Architecture

Phase 9 introduces a capability-secured extension runtime. Plugins declare a strongly typed manifest, are validated before installation, ordered through semantic-version dependency resolution, executed behind a sandbox and exposed only least-privilege APIs.

## Lifecycle

Install, validate, resolve dependencies, load, initialize, activate, suspend, resume, reload, update, disable, enable, uninstall and destroy are supported by `PluginRuntime` and orchestrated by `PluginManager`.

## Manifest

Manifests include identity, version, engine/platform compatibility, permissions, dependencies, optional dependencies, entrypoint, activation events, configuration schema, capabilities, signature and checksum metadata.

## Permissions and sandbox

Permissions use capability names such as `network.read`, `vpn.connect`, `dns.modify`, `config.read`, `metrics.export` and `plugin.update`. The sandbox denies undeclared capabilities and removes ambient Node globals from evaluated extension code.

## SDK

Use `BasePlugin` or `definePlugin` from `@irp/plugin-sdk`, provide a manifest and implement lifecycle hooks. Built-in reference plugins cover DNS, VPN, notifications, metrics and health checks.
