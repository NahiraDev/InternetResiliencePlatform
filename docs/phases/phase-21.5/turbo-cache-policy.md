# Phase 21.5 Turbo Cache Policy

Turbo test inputs retain `$TURBO_DEFAULT$` plus the root Vitest configuration, so source files, test files, package manifests, lockfiles, and package-local configuration participate in hashing. The final gate distinguishes normal cached workspace tests from a forced fresh coverage run.

Required fresh evidence:

```bash
pnpm exec turbo run test --force -- --coverage
```

The run is acceptable only when Turbo reports zero cached test tasks (for example, `Cached: 0 cached`).
