# Runtime Execution Security

Runtime API reads require authentication and runtime permissions. Runtime cycles require `runtime.simulate` for simulation/safe modes and `runtime.execute` for live requests. Safe/live execution-capable requests require `Idempotency-Key`; live requests are rejected fail-closed in this implementation. Production/staging API startup requires `JWT_SECRET`; no production development-secret fallback is allowed.

Secrets, credentials, tokens, private keys, raw plugin internals, and raw kernel commands must not be included in runtime DTOs, events, decisions, or persisted audit metadata.
