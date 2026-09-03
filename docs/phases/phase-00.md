# Phase 00 — Bootstrap

## Status

**Implemented baseline — historical phase record.** Current production readiness is determined by the current repository gates, not by this historical record.

## Objective

Establish a reproducible repository baseline from which all later IRP phases can be implemented, verified, and released without hidden local state.

## Scope

- repository and monorepo bootstrap;
- package manager and workspace conventions;
- baseline TypeScript/build configuration;
- initial CI execution path;
- repository validation entry point;
- deterministic developer bootstrap expectations;
- baseline documentation and project-state conventions.

## Dependencies

None. This is the project bootstrap phase.

## Implementation evidence

The implementation is represented by the repository root, workspace/package configuration, package-manager tooling, validation tooling, and CI configuration on `main`. See:

- [`../../README.md`](../../README.md)
- [`../../package.json`](../../package.json)
- [`../../pnpm-workspace.yaml`](../../pnpm-workspace.yaml)
- [`../../scripts/validate-repository.mjs`](../../scripts/validate-repository.mjs)

## Acceptance criteria

- a clean checkout has a documented bootstrap path;
- workspace/package-manager expectations are explicit;
- repository validation can run from the documented environment;
- CI has a deterministic baseline path;
- later phases can add packages and contracts without changing the bootstrap model implicitly.

## Verification

Phase 00 is historical. Its current relevance is preserved through the repository validation and CI gates used by later phases. Do not infer current CI health from this record; use the latest workflow results.

## Non-goals

Phase 00 does not define network intelligence, routing, DNS autonomy, tunnels, gateways, clients, or production networking behavior.

## Documentation rule

Later phases must extend the bootstrap contracts rather than create parallel workspace conventions. If the bootstrap contract changes, update the canonical root/project documentation and this phase record's references.
