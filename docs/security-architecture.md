# Security Architecture

Phase 8 introduces a zero-trust security foundation in `@irp/security`. Every principal, device, node, API request, and service token is verified explicitly, authorized by declared endpoint permissions, and audited through tamper-evident records.

## RBAC Guide

Roles are `Admin`, `Power User`, `User`, `Read Only`, `Plugin`, `Daemon`, and `Node`. Permissions include `network.read`, `network.write`, `dns.modify`, `vpn.connect`, `proxy.modify`, `node.manage`, `cluster.manage`, `plugin.install`, `plugin.remove`, `settings.read`, `settings.write`, `audit.read`, `audit.export`, and `security.manage`. Register every endpoint with `EndpointRegistry` and a non-empty permissions list.

## Authentication Flow

`TokenService` issues typed JWT-compatible tokens for access, refresh, device, session, API, service, and plugin use cases. Claims carry subject, roles, permissions, device identity, expiry, issuer, and unique token IDs to preserve OAuth and SSO compatibility.

## Certificate Lifecycle

`CertificateAuthority` creates, validates, renews, and checks expiration for signed certificate records. The record format includes subject, issuer, public key, serial, validity window, and signature for future mTLS trust chains.

## Secret Management Guide

`SecretManager` stores API keys, tokens, private keys, certificates, passwords, and encryption keys as AES-256-GCM encrypted records. Plaintext is only returned by explicit `reveal` calls and metadata excludes ciphertext and secret values.

## Threat Model

The base detector emits events for repeated failures, token abuse, permission escalation, replay attempts, invalid certificates, and unexpected node behavior. Security events centralize unauthorized access, expired tokens or certificates, invalid signatures, brute force attempts, suspicious traffic, tamper detection, and replay attempts.

## Security Best Practices

Use secure production environment validation, rotate keys with grace-period backups, never log passwords/private keys/secrets/tokens, require request nonces and timestamps, enable request signatures for sensitive endpoints, and keep audit exports permission-gated with `audit.export`.
