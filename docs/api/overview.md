# API Overview

The API is the control-plane and observation interface for IRP services.

## API principles

- Version HTTP routes under `/api/v1`.
- Authenticate and authorize protected operations.
- Use stable response and error envelopes.
- Keep observation endpoints side-effect free.
- Validate input at the transport boundary.
- Correlate requests for diagnostics.
- Do not expose credentials or internal secrets in responses.

## Endpoint families

The API surface evolves with the implemented packages. Typical families include platform status, network measurement, diagnostics, authentication, configuration, and controlled runtime operations.

Only implemented and verified routes should be documented as supported.

## Status and live metrics

See [Platform Status API](platform-status-api.md) for the currently documented read-only status and SSE metrics endpoints.

## Contract ownership

The running Fastify route registration, schemas, service implementations, and API tests are authoritative. Documentation should describe those contracts without copying historical phase requirements.
