# Phase 40 Validation Evidence

This file records the repository-side evidence contract for the final roadmap phase.

## Deterministic evidence

The Phase 40 harness validates four scenario classes:

1. healthy operation;
2. correlated DNS/application degradation;
3. persistent provider degradation with verification failure and recovery;
4. destination-specific evidence with independent observations.

The harness also verifies an injected execution failure at the apply boundary without performing host network mutation.

## Required repository gates

The final completion boundary is repository verification, not source existence:

```text
pnpm install --frozen-lockfile
pnpm validate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

CI is authoritative for the complete workspace and Docker/runtime smoke path where applicable.

## Completion state

Implementation is present on the Phase 40 branch. The final phase must remain marked verification-pending until GitHub Actions provides concrete passing evidence for the resulting commit.
