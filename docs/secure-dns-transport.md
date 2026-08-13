# Phase 15 — Secure DNS Transport & Encrypted Resolver Layer

Phase 15 adds the transport layer used after the Phase 14 DNS engine has selected a resolver. It does not replace the DNS engine, resolver registry, routing engine, connectivity manager, kernel, policy engine, health system, telemetry package, or plugin framework.

## Architecture

The layer preserves the project separation of responsibility:

1. Phase 14 DNS Engine selects the resolver.
2. Phase 15 Secure DNS Transport selects a policy-compliant transport for that resolver.
3. Phase 13 Routing Engine may be asked to simulate/select a route to the resolver endpoint.
4. Phase 12 Connectivity Manager state may be carried in the transport context.
5. Phase 10 Kernel remains the privileged execution boundary.
6. The selected DoH or DoT transport performs an authenticated DNS wire-format exchange.

The main implementation is `SecureDnsTransportEngine`. It exposes `simulateDnsTransportSelection(...)` for dry-run explainability and `resolve(...)` for real transport execution.

## Implemented transports

- **DNS-over-HTTPS (DoH): implemented.** It validates `https://` endpoints, uses POST with `Content-Type: application/dns-message`, requests `Accept: application/dns-message`, enforces TLS certificate and hostname validation through Node's HTTPS stack, uses keep-alive connection reuse, checks HTTP status, bounds response size, and validates DNS wire responses.
- **DNS-over-TLS (DoT): implemented.** It validates hostname endpoints, uses port 853, enforces TLS 1.2 minimum with certificate and hostname verification, sends DNS wire messages with the two-byte TCP length prefix, supports connection reuse, timeouts, graceful close, and response-size limits.
- **DNS-over-QUIC (DoQ): extension point only.** The built-in `DnsOverQuicTransport` declares the protocol boundary and capabilities but intentionally does not claim support because this repository has no stable QUIC dependency yet.
- **UDP/TCP/system/DNSCrypt/custom:** represented in the transport type model for future or plugin-provided transports. Phase 15 does not add a second DNS engine for these modes.

## Security profiles and policy

Reusable profiles are exported as `dnsTransportSecurityProfiles`:

- `strict`: encrypted transports only, certificate validation required, hostname verification required, no plaintext fallback.
- `secure`: same encrypted-only semantics as strict without UI assumptions.
- `balanced`: encrypted transports preferred; plaintext is not used as a fallback unless policy/profile explicitly allows it.
- `compatibility`: may allow plaintext transports only when policy and configuration allow it; TLS validation still cannot be disabled.

`DnsTransportPolicy` reuses the existing policy-provider style by passing a policy decision into the transport context instead of creating a second rule engine. It supports encrypted DNS requirements, preferred/required/denied transports, resolver requirements, certificate-validation requirements, and plaintext-denial semantics.

## Downgrade protection

Transport selection distinguishes retryable transport failures from policy and security failures. If encrypted DNS is required and DoH/DoT fail, UDP or TCP are not silently selected. Plaintext fallback requires explicit profile and policy authorization.

## Resilience and lifecycle

The transport engine includes:

- bounded connection pooling keyed by resolver, transport, endpoint, TLS identity, security profile, route, connectivity source, and proxy metadata;
- bounded retry attempts with exponential backoff and jitter;
- transport-level circuit breakers with closed/open/half-open states;
- graceful shutdown that stops new work and closes pooled connections;
- cancellation via `AbortSignal` in the transport context;
- bounded DNS response-size enforcement.

## Observability, audit, and privacy

The engine emits existing `EventBus` events such as `dns.transport.registered`, `dns.transport.selected`, `dns.transport.policy.rejected`, `dns.transport.connection.started`, `dns.transport.connection.established`, `dns.transport.failover.started`, and `dns.transport.circuit.opened`.

Metrics are recorded through the existing `MetricsRegistry` with low-cardinality labels such as transport type and error code. Query names and response contents are not emitted by default; dry-run decisions include only a query hash and record type.

## Plugin boundary

Plugins can register future `DnsTransport` implementations through the `DnsTransportRegistry`. A plugin transport must explicitly declare its capabilities and should be constrained by the existing Phase 10 capability model and existing plugin runtime. Transport plugins do not receive filesystem, shell, privileged networking, credential, or kernel access by default.

## Deferred work

- Full DoQ support awaits a maintained QUIC implementation and protocol tests.
- HTTP/3 support is not required for built-in DoH until a mature dependency exists.
- DNSCrypt remains a future/plugin transport.
- Proxy, VPN, tunnel, desktop, mobile, AI decisioning, fleet, and distributed-node functionality remain later roadmap phases.
