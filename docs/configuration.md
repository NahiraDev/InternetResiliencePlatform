# Configuration

Configuration should be explicit, validated, environment-specific, and free of secrets committed to source control.

## Core runtime variables

| Variable | Purpose |
| --- | --- |
| `IRP_API_HOST` | API bind address |
| `IRP_API_PORT` | API listen port |
| `IRP_LOG_LEVEL` | Structured logging level |
| `IRP_LOG_FILE` | Optional log destination |
| `IRP_TELEMETRY_ENABLED` | Enable telemetry integration |

The complete supported configuration surface is defined by the application/package configuration schemas. This document is the conceptual reference; schemas and implementation remain authoritative for exact validation rules.

## Automatic optimization

Automatic optimization is opt-in and must remain governed by resilience-runtime policy and safety checks.

| Key | Default | Constraint |
| --- | --- | --- |
| `AUTO_OPTIMIZATION_ENABLED` | `false` | explicit opt-in |
| `AUTO_OPTIMIZATION_MIN_CONFIDENCE` | `90` | `0..100` |
| `AUTO_OPTIMIZATION_MAX_RISK` | `25` | `0..100` |
| `AUTO_OPTIMIZATION_MIN_BENEFIT` | `60` | `0..100` |
| `AUTO_OPTIMIZATION_COOLDOWN_MS` | `30000` | `>= 0` |
| `AUTO_OPTIMIZATION_MAX_ACTIONS_PER_WINDOW` | `6` | integer `>= 0` |
| `AUTO_OPTIMIZATION_DRY_RUN` | `false` | enabled means no mutation |
| `AUTO_OPTIMIZATION_ROLLBACK_ON_VERIFY_FAILURE` | `true` | fail closed when rollback is unavailable |

## Secrets

Never commit credentials, API tokens, refresh tokens, device secrets, private keys, or production environment files. Supply secrets through the deployment environment or an approved secret manager.

## Regional validation

Regional validation is an evidence workflow, not normal application configuration. See [Regional Validation](regional-validation.md).
