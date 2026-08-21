# InternetResiliencePlatform — Agent Continuation Contract

This repository is designed to be continued by different engineering agents or accounts without relying on conversational memory.

## Required startup procedure

Before changing code:

1. Read `ROADMAP.md`.
2. Read `PROJECT_STATE.md`.
3. Inspect the current implementation and relevant tests.
4. Identify the current phase and its incomplete acceptance criteria.
5. Run or inspect the smallest relevant verification first, then the complete repository gates before declaring completion.

## Phase progression

- The roadmap contains exactly 40 phases.
- Do not invent additional phases unless the user explicitly changes the product scope.
- Do not skip a failing phase merely to advance the phase number.
- A phase is complete only when its implementation, tests, CI, and required runtime verification pass.
- Update `PROJECT_STATE.md` whenever a phase materially changes status or a blocker/fix becomes important for continuation.

## Current handoff

Read `PROJECT_STATE.md` for the authoritative current phase, verification state, latest fix, and next-phase brief.

## Engineering constraints

- Headless/core-first architecture.
- No dashboard, Electron UI, or mobile UI work unless explicitly requested.
- Core network intelligence, autonomous decision-making, destination-aware routing, verification, resilience, security, and runtime correctness take priority.
- Use pnpm; do not introduce npm-based workflows.
- Do not weaken CI gates to make a build green.
- Fix root causes and preserve production behavior.
- Do not modify `README.md` unless the user explicitly requests it.
- Avoid duplicate abstractions; extend existing contracts when appropriate.
- Every autonomous network action must remain policy-bounded, observable, verifiable, reversible, and protected against route flapping.

## Definition of done

A change is not done until the relevant deterministic tests pass and the repository's CI/runtime gates provide evidence that the change works in the intended production path.
