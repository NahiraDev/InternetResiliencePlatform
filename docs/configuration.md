# Configuration

This document describes configuration that is relevant to the current implementation on `main`.

## Configuration sources

Configuration is supplied by the repository's configuration files and environment variables. Environment-specific values must be explicit; invalid values should fail validation rather than silently selecting permissive defaults.

Common runtime variables include:

| Variable | Purpose |
| --- | --- |
| `IRP_API_HOST` | API bind address |
| `IRP_API_PORT` | API listen port |
| `IRP_LOG_LEVEL` | Structured logging level |
| `IRP_LOG_FILE` | Optional log destination |
| `IRP_TELEMETRY_ENABLED` | Enable telemetry integration |

Check the application/package configuration schemas for the complete set of supported variables. Do not treat historical phase documents as configuration references.

## Automatic optimization

Automatic optimization is disabled unless explicitly enabled and must remain subject to the resilience-runtime policy and safety gates.

| Key | Default | Constraint |
| --- | --- | --- |
| `AUTO_OPTIMIZATION_ENABLED` | `false` | explicit opt-in |
| `AUTO_OPTIMIZATION_MIN_CONFIDENCE` | `90` | `0..100` |
| `AUTO_OPTIMIZATION_MAX_RISK` | `25` | `0..100` |
| `AUTO_OPTIMIZATION_MIN_BENEFIT` | `60` | `0..100` |
| `AUTO_OPTIMIZATION_COOLDOWN_MS` | `30000` | `>= 0` |
| `AUTO_OPTIMIZATION_MAX_ACTIONS_PER_WINDOW` | `6` | integer `>= 0` |
| `AUTO_OPTIMIZATION_DRY_RUN` | `false` | never mutates when enabled |
| `AUTO_OPTIMIZATION_ROLLBACK_ON_VERIFY_FAILURE` | `true` | fail closed when rollback is unavailable |

## Security

Never commit credentials, API tokens, refresh tokens, device secrets, private keys, or production environment files. Secret values must be provided through the deployment environment or an appropriate secret manager.

## Regional validation

Regional validation is an optional evidence workflow and is not part of normal application configuration. See [regional validation](regional-validation.md) for its dedicated requirements.
