# Mobile Client Usage

InternetResiliencePlatform remains headless. Phase 43 does **not** add an iOS or Android UI. A phone is a remote client of the existing HTTPS control plane.

## Runtime model

```text
iPhone / Android app
        │ HTTPS
        ▼
IRP Fastify API
        │
        ├── remote-client authentication
        ├── runtime/autopilot APIs
        └── distributed probe evidence
```

The phone does not need to run the network agent or store a probe private key merely to inspect the platform. It authenticates as a bounded remote client and receives a short-lived access token.

## Provisioning

An administrator enrolls the phone through:

`POST /api/v1/auth/remote/devices/enroll`

Use `platform: "ios"` for iPhone or `platform: "android"` for Android. The enrollment response contains a device credential secret exactly once. Store it in the operating system's secure credential storage; do not put it in source control, analytics, logs or crash reports.

The phone exchanges the credential for an access token with:

`POST /api/v1/auth/remote/token`

Use the returned token as:

`Authorization: Bearer <access-token>`

Access tokens are short-lived. The phone uses the rotating refresh token with:

`POST /api/v1/auth/remote/refresh`

A refresh token is single-use; always persist the newly returned refresh token before attempting another refresh. Logout invalidates the current refresh session.

## What the phone can do

With the default bounded remote-client scopes, a future native app can:

- display agent/runtime status;
- inspect current resilience state;
- read measurements;
- inspect autopilot decisions exposed by the control plane;
- inspect regional probe status and destination comparisons.

The phone is **not** a privileged administrator. Probe registration/revocation requires `runtime.admin` and should remain a server/operator operation.

## Important distinction

A remote client and a regional probe are different roles:

- **Remote client:** your phone; authenticates with device credentials and consumes the headless API.
- **Regional probe:** an independently hosted measurement node; owns an Ed25519 private key and signs network evidence.

The phone should not be treated as an Iranian/regional probe unless it is intentionally deployed as one and its egress is independently validated.

## Current status

The repository provides the secure headless API contract. A native iOS/Android application is not part of the current roadmap. A mobile application can therefore be added later without changing the core resilience engine, provided it consumes these APIs rather than embedding route-selection logic.
