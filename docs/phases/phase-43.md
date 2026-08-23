# Phase 43 — Distributed Probe Federation

## Goal

Federate independent regional probes so the control plane can compare service observations from multiple network vantage points without trusting an unsigned client report.

## Delivered

- Ed25519 probe identity: the control plane stores only each probe's public key.
- Signed, canonicalized evidence envelopes.
- Replay protection using evidence IDs and payload fingerprints.
- Clock-skew and evidence-age limits.
- Per-probe and global bounded evidence capacity.
- Probe registration, inspection and revocation through the authenticated API.
- Evidence ingestion through the signed federation endpoint.
- Destination-level comparison with `consistent`, `mixed` and `insufficient` outcomes.
- Bounded measurements for latency, jitter, packet loss, DNS, TCP, TLS and HTTP timing.
- No route/VPN decision is made by the federation layer; it is an evidence and comparison subsystem.

## API

| Method | Route | Purpose | Authorization |
| --- | --- | --- | --- |
| POST | `/api/v1/federation/probes` | Register a probe public key | `runtime.admin` |
| GET | `/api/v1/federation/probes` | List probe health metadata | `runtime.inspect` |
| POST | `/api/v1/federation/probes/:probeId/revoke` | Revoke a probe identity | `runtime.admin` |
| POST | `/api/v1/federation/evidence` | Submit signed evidence | Probe signature |
| GET | `/api/v1/federation/evidence` | Query accepted evidence | `runtime.inspect` |
| GET | `/api/v1/federation/compare/:destination` | Compare regional observations | `runtime.inspect` |
| GET | `/api/v1/federation/stats` | Federation counters | `runtime.inspect` |

## Probe trust model

1. Generate an Ed25519 key pair on the probe.
2. Register only the public key with the control plane.
3. Keep the private key on the probe; it is never sent to the API.
4. Sign each evidence envelope locally.
5. Submit the signed envelope to `/api/v1/federation/evidence`.
6. The API verifies the signature, timestamp, probe status and replay state before accepting evidence.

A probe key cannot be replaced in-place. Revoke the old identity and register a new probe ID/key when rotating a compromised identity.

## Acceptance gate

Phase 43 is implementation-complete when repository validation, typecheck, unit tests, build, API smoke and Docker/runtime CI pass on the resulting commit. External regional operation still requires independently hosted probes; source code alone cannot prove a real regional vantage point.

## Status / Verification

**Implementation status:** federation contracts, signed evidence handling, replay protection, probe lifecycle and comparison APIs are implemented.

**Verification status:** repository-side implementation is documented as verification-pending until repository validation, typecheck, unit tests, build, API smoke and Docker/runtime CI have passed on the resulting commit.

**External boundary:** independently hosted regional probes are required for real multi-vantage operation. Their absence must not be represented as successful regional validation.
