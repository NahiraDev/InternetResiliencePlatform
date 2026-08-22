# Testing and Verification

IRP treats correctness as a stack of verification gates rather than a single test command.

## Standard checks

```bash
pnpm validate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Verification layers

| Layer | Purpose |
| --- | --- |
| Unit tests | Validate isolated domain behavior |
| Integration tests | Validate package/service boundaries |
| API tests | Validate HTTP contracts and safety boundaries |
| Runtime tests | Validate startup, readiness, and shutdown |
| Container smoke tests | Validate production-like Docker lifecycle |
| Security checks | Validate security-sensitive invariants |
| Regional validation | Validate explicitly configured regional evidence |

A passing unit test does not imply production readiness when runtime, integration, or security gates are required.

## Documentation rule

When a feature changes behavior, update the relevant canonical documentation and tests together. Phase reports should not become the only description of a capability.
