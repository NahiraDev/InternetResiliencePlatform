# CI Contract

CI is an executable architectural contract, not a cosmetic status indicator.

## Required properties

1. Required checks must fail when their underlying command fails.
2. Failures must propagate through `needs` and final gates.
3. Runtime and Public Runtime Lab jobs must have bounded startup, readiness, stability and cleanup phases.
4. Readiness is not sufficient: the service/container must remain stable for the configured observation window.
5. Cleanup must execute on success, failure and cancellation where the platform permits it.
6. Main-branch evidence must not be accidentally cancelled by a newer push when the evidence is intended to certify that commit.
7. Concurrency must be explicit. Use cancellation for disposable PR validation; preserve or serialize authoritative main/runtime evidence as appropriate.
8. No required check may be made green with `continue-on-error`, `|| true`, unconditional success output, or test skipping.
9. Workflow triggers must include all source paths that can materially affect the job.
10. A workflow that produces authoritative evidence must expose a deterministic final result.
11. Release publication must consume the single fail-closed Release Gate and must not publish directly from an individual validation workflow.

## Dependency model

Static checks precede package verification; package verification precedes runtime verification; runtime verification precedes final integration/release gates when applicable.

A job that consumes artifacts or services from another job MUST express that dependency explicitly rather than relying on timing.

## Runtime Lab contract

Every runtime lab should implement:

```text
checkout
→ install
→ build
→ start
→ readiness
→ stability window
→ functional verification
→ diagnostics on failure
→ cleanup
→ explicit final status
```

No fixed sleep may be the sole readiness mechanism. Poll for the actual health contract with a bounded timeout.

## Concurrency

PR checks may cancel obsolete runs. Authoritative `main` runtime evidence must not be cancelled merely because a newer commit arrived. If an external shared environment exists, serialize access with an explicit concurrency group.

GitHub Actions supports workflow/job concurrency and environment protection; use those primitives deliberately rather than accidental queueing.

## Release Gate

The Release Gate validates the exact main commit and waits for all release-blocking workflow runs for that same SHA to complete successfully. A successful gate is the only prerequisite consumed by publication workflows.

The Public Runtime Lab remains authoritative runtime/soak evidence, but it is intentionally not a release publication prerequisite because it depends on an ephemeral public Quick Tunnel and external network availability.

## Review checklist

- trigger paths complete?
- dependency graph explicit?
- failure propagation intact?
- timeouts bounded?
- readiness meaningful?
- stability window present?
- cleanup reliable?
- cancellation semantics correct?
- artifacts useful for diagnosis?
- no false-green paths?
- required status checks deterministic?
- release publication behind Release Gate?
