# Contributing

Thank you for helping improve the Internet Resilience Platform.

## Development workflow

1. Create a topic branch from the default branch.
2. Keep changes focused and documented.
3. Run local checks before opening a pull request:
   - `./scripts/lint.sh`
   - `./scripts/test.sh`
4. Open a pull request using the repository template.

## Commit style

Use concise conventional commit-style messages where practical, such as `docs: add architecture overview` or `ci: add lint workflow`.

## Documentation

Architecture-impacting changes should include documentation updates. Long-lived design decisions should be captured as ADRs under `docs/adr/`.
