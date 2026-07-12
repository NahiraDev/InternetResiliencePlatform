# ADR-0001: Repository architecture

## Status

Accepted

## Context

The Internet Resilience Platform needs a predictable repository foundation before implementation work begins. Contributors need clear places for documentation, automation, security policy, development scripts, and future product code.

## Decision

Adopt a documentation-first repository architecture with these top-level areas:

- `.github/` for GitHub metadata, issue templates, pull request templates, dependency update configuration, and workflow automation.
- `docs/` for project documentation grouped by architecture, ADRs, security, development, and network concepts.
- `scripts/` for local commands that mirror CI entry points.
- Root-level governance and hygiene files such as `README.md`, `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `CODEOWNERS`, and formatting configuration.

Application source code will be added in later phases after platform boundaries and validation expectations are documented.

## Consequences

- Contributors can understand repository expectations before runtime components exist.
- CI can validate repository hygiene immediately and expand as code is introduced.
- Architecture decisions have a stable home and index from Phase 0 onward.
- Later phases must update this ADR or add new ADRs if the repository architecture changes significantly.
