# Phase 55 — Gateway Security & Supply-Chain Hardening

## Status

**Implementation started; verification required.**

## Objective

Harden the canonical gateway domain against unauthorized gateway identity, stale/replayed security evidence, revoked signing keys, provider-policy violations and tampered gateway artifacts without creating a second trust, registry or tunnel domain.

## Scope

Phase 55 adds a provider-neutral security verifier to `@irp/gateway-registry` with:

- Ed25519-signed gateway identity attestations;
- bounded issuance/expiry and clock-skew validation;
- trusted-key registration and explicit key revocation;
- provider allow-list enforcement;
- Ed25519-signed gateway artifact attestations;
- SHA-256 artifact digest verification;
- matching signer enforcement between identity and artifact evidence;
- bounded process-local nonce replay protection;
- secret-free security telemetry;
- pure assessment semantics: verification does not mutate gateway lifecycle, trust, routes, DNS or tunnel state.

## Threat model

The verifier treats the following as untrusted input:

- gateway metadata supplied by an external discovery/provider adapter;
- identity attestations and signatures;
- artifact bytes and artifact metadata;
- timestamps, nonces and provider identifiers.

The verifier protects against:

1. forged gateway identity without a trusted signing key;
2. tampered identity payloads;
3. expired, future-dated or excessively old attestations;
4. replay of an accepted identity or artifact nonce within the verifier's tracked window;
5. revoked signing keys;
6. provider identity mismatch and policy violations;
7. artifact substitution where bytes do not match the signed SHA-256 digest;
8. using different trusted signers for gateway identity and its artifact evidence.

This phase does not claim to provide full remote attestation, hardware-rooted trust, malware detection or compromise detection after valid signing credentials have been compromised. Nonce replay tracking is process-local and bounded; distributed deployments must provide a shared replay/nonce store at a higher control-plane layer.

## Security contract

`GatewaySecurityVerifier` is the sole security verification primitive for gateway identity/supply-chain evidence in this phase.

### Identity evidence

An identity attestation contains:

- gateway ID;
- provider ID when applicable;
- signing key ID;
- Ed25519 algorithm identifier;
- issued/expiry timestamps;
- a nonce;
- detached Ed25519 signature over the canonical payload.

The verifier requires a trusted, non-revoked public key and rejects evidence outside the configured freshness/clock-skew window. After successful verification, the identity nonce is consumed and cannot be accepted again until its tracked entry expires/evicts.

### Artifact evidence

An artifact attestation contains:

- gateway ID;
- artifact ID and version;
- lowercase SHA-256 digest;
- signing key ID and Ed25519 algorithm;
- issued/expiry timestamps;
- a nonce;
- detached Ed25519 signature over the canonical payload.

The verifier hashes the supplied artifact bytes and requires an exact digest match before accepting the signature. The default policy requires artifact evidence for a complete security assessment. Artifact nonces are likewise consumed after successful verification.

## Safety properties

- Private keys and credentials are never accepted by the verifier or emitted through telemetry.
- Public keys are the only key material stored by the verifier.
- Key revocation is explicit and immediately affects subsequent verification.
- Signature authenticity is checked before claim/provider semantics so tampered claims cannot be reported as trusted policy mismatches.
- Expiration is evaluated before maximum-age classification, avoiding ambiguous failure semantics for stale evidence.
- Nonce tracking is bounded by `maxTrackedNonces` and expired entries are pruned before capacity eviction.
- Verification is deterministic for the same inputs and reference time until a nonce is intentionally consumed.
- Verification has no network dependency and performs no provider/tunnel/route/DNS mutation.
- Security rejection is fail-closed: invalid evidence throws and cannot produce a verified assessment.
- Telemetry contains only gateway ID, timestamp and a bounded failure reason; it contains no signature, key material or artifact bytes.
- Artifact digest verification uses SHA-256 and rejects malformed digests.
- The implementation uses Node's standard cryptographic primitives; no additional cryptographic dependency is introduced.

## Tests

`security.test.ts` covers:

1. valid identity plus matching artifact verification;
2. tampered signed identity payload rejection;
3. expired and future-dated attestation rejection;
4. identity and artifact nonce replay rejection;
5. revoked key and provider-policy rejection;
6. artifact digest mismatch rejection;
7. mismatched identity/artifact signer rejection;
8. digest-only verification and malformed digest rejection;
9. explicit opt-out of mandatory artifact evidence.

## Acceptance criteria

- [x] Gateway identity evidence has a canonical signed verification contract.
- [x] Ed25519 signatures are verified using trusted public keys.
- [x] Expiry, maximum age and clock-skew bounds are enforced.
- [x] Signing-key revocation is supported.
- [x] Provider allow-list policy is supported.
- [x] Artifact SHA-256 digest and signature evidence are verified.
- [x] Identity and artifact signer continuity is enforced.
- [x] Bounded process-local nonce replay protection is implemented.
- [x] Security verification is side-effect free with respect to gateway/network/tunnel state.
- [x] Security tests cover normal, boundary and failure paths.
- [ ] `pnpm typecheck` passes for the final Phase 55 commit.
- [ ] `pnpm lint` passes for the final Phase 55 commit.
- [ ] `pnpm test` passes for the final Phase 55 commit.
- [ ] `pnpm build` passes for the final Phase 55 commit.
- [ ] `pnpm validate` passes for the final Phase 55 commit.
- [ ] Required CI checks are green for the final Phase 55 commit.

## Explicit non-goals

- automatic trust promotion of gateways;
- direct modification of `GatewayMetadata.trust`;
- route, DNS or tunnel mutation;
- provider-specific provisioning or upgrade logic;
- hardware/TPM remote attestation;
- malware/behavioral scanning;
- secret storage or private-key management;
- distributed nonce/replay storage inside `@irp/gateway-registry`.
