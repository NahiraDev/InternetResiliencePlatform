# Deployment Model

IRP can be deployed as a control plane, gateway/probe infrastructure, client runtime, or a combination of these roles.

## Roles

### Control plane

Provides authenticated APIs, configuration, policy, device state, audit and coordination.

### Gateway

Provides an authorized network egress or transport capability through a supported provider adapter. Gateway selection is controlled by policy and health evidence.

### Probe

Produces regional or destination measurements. A probe is evidence-producing infrastructure and must not be treated as authoritative merely because it reports a result.

### Client

Runs the user-facing or host-integrated runtime and consumes shared capabilities.

## Deployment principles

- Keep control-plane state durable and backed up.
- Keep gateway credentials and private keys out of application logs and source control.
- Separate control-plane credentials from gateway credentials.
- Prefer immutable/reproducible application images for server deployments.
- Define health checks and rollback before production upgrades.

## Environment separation

Development, test, staging and production must use separate credentials, state and telemetry namespaces. Production configuration must never depend on developer-local files.

## Verification

A deployment is considered usable only after health checks, API readiness, runtime smoke tests and rollback/recovery checks succeed.
