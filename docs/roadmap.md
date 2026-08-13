# GuardianDNS Roadmap

## Sprint 0 - Foundation

- Repository structure
- Engineering documentation
- Development workflow
- Initial CI setup

## Future

- Telemetry collection
- Resolver evaluation engine
- Policy automation
- Adaptive orchestration

## Phase 15 — Secure DNS Transport & Encrypted Resolver Layer

Implemented in `@irp/dns` as the secure resolver transport layer consumed after Phase 14 resolver selection. It adds DoH and DoT transports, a DoQ extension point, security profiles, downgrade protection, selection simulation, pooling, retry/backoff, circuit breaking, privacy-safe telemetry, and event/audit hooks while preserving the 40-phase roadmap and deferring proxy/VPN/tunnel/AI work to later phases. See `docs/secure-dns-transport.md`.
