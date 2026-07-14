# Phase 5 API

All Phase 5 endpoints are versioned below `/api/v1` and return standardized envelopes:

- Success: `{ "success": true, "data": ..., "meta": ... }`
- Error: `{ "success": false, "error": { "code", "message", "details" } }`

## Platform

- `GET /health`
- `GET /ready`
- `GET /live`
- `GET /version`
- `GET /metrics`

## Authentication

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/password-reset/request`
- `POST /auth/email-verification/request`

## Business Modules

- `GET /me`
- `GET /users`
- `GET /users/:id`
- `GET /organizations`
- `POST /organizations`
- `GET /organizations/:id`
- `DELETE /organizations/:id`
- `GET /projects`
- `POST /organizations/:id/projects`
- `GET /projects/:id`
- `GET /workspaces`
- `POST /organizations/:id/workspaces`
- `GET /workspaces/:id`

Collection endpoints support `page`, `pageSize`, `sort`, `order`, and `search` query parameters.
