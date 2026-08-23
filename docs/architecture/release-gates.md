# Release Gates

## Purpose

Release gates define the minimum evidence required before a phase or product capability is considered complete.

## Universal phase gate

```text
Implementation
  -> Tests
  -> Typecheck
  -> Lint
  -> Repository validation
  -> Runtime verification (when applicable)
  -> Security review (when applicable)
  -> Documentation/state synchronization
  -> CI green
```

## Required checks

- `pnpm validate`
- `pnpm typecheck`
- `pnpm lint`
- relevant unit/integration tests
- relevant builds
- runtime smoke/health verification for process, container, networking, or platform changes

## Network mutation gate

Changes affecting DNS, routing, connectivity, tunnels, gateways, or failover require:

1. normal-path verification;
2. failure-path verification;
3. bounded retry/recovery behavior;
4. rollback or safe fallback;
5. observability evidence;
6. no unsafe silent degradation.

## Client gate

Desktop and mobile changes require lifecycle, reconnect, authentication/session, secure-storage, permission, and platform-specific behavior verification as applicable.

## Security gate

Authentication, authorization, credentials, key material, device identity, gateway trust, or privileged execution changes require a security review and explicit negative/failure tests.

## Completion rule

A phase is not complete because code compiles or tests happen to pass. The phase contract, implementation evidence, documentation, and required release gates must agree.
