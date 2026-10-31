# Release and CI Policy

This document describes the current release automation. It replaces the former
all-workflows exact-SHA Release Gate process.

## Release workflow

A tag matching `vX.Y.Z` starts `.github/workflows/release.yml`.

The workflow:
1. Resolves and validates the semantic version tag.
2. Builds the supported platform bundles (Android, Linux, macOS, Windows, and iOS source).
3. Runs the platform packaging smoke checks already defined in each build job.
4. Generates and verifies `SHA256SUMS.txt`.
5. Publishes a GitHub prerelease with generated release notes while production certification remains unverified.

A release does not wait for every CI, security, runtime, soak, or platform workflow
to have a successful run on the exact same commit. A failed platform build or failed
packaging smoke still prevents publishing because the required artifact is unavailable.

The release workflow does not create a signed iOS IPA. iOS distribution remains a
source/developer bundle until signing and provisioning are implemented.

## Container images

A successful core CI run on `main` triggers Docker publication. Images are published
with an immutable `sha-<short-sha>` tag and a moving `latest` tag. Provenance, SBOM,
image vulnerability scanning, and Cosign signing remain enabled.

## CI layout

| Workflow | Trigger | Responsibility |
| --- | --- | --- |
| CI | Pull requests and pushes to main | Repository validation, architecture checks, lint, typecheck, tests, coverage, build, Docker smoke |
| Platform clients | Pull requests and manual dispatch | Android, iOS, macOS, Windows build and platform contracts |
| Linux Primary Device | Pull requests and manual dispatch | Debian package build, install, systemd and runtime smoke |
| System Assurance | Pushes to main and manual dispatch | Canonical runtime production-assurance checks |
| Runtime Lab | Pushes to main and manual dispatch | Docker observability/runtime integration |
| Public Runtime Lab | Weekly schedule and manual dispatch | Long public-tunnel soak; not a normal PR/release prerequisite |
| Repository Deep Audit | Weekly schedule and manual dispatch | Repository and documentation audit only |
| CodeQL / Dependency Review | Security-specific triggers | Static analysis and dependency review |
| Regional Validation | Manual dispatch on a regional self-hosted runner | Real regional vantage-point evidence |
| IRP Release | Version tag or manual dispatch | Cross-platform packaging and GitHub Release |
| Docker Publish | Successful main CI run | SHA and latest container image publication |

The deep audit no longer repeats the full workspace test/typecheck/lint/build matrix
or the runtime smoke already performed by CI and Runtime Lab. Long-running public
soak is scheduled weekly rather than on every main push.

## Production readiness

Publishing a release and claiming production readiness are separate decisions.
Release automation no longer blocks publication on external certification evidence.
Do not describe a release as production-certified unless the corresponding real-device,
security, regional, deployment, rollback, and recovery evidence has actually been
collected and reviewed.

## Operating principles

- Keep core CI failures visible; do not use `continue-on-error` to manufacture green runs.
- Keep packaging smoke tests and checksum verification.
- Keep security scanning and image signing.
- Do not require unrelated long-running workflows to finish before a version can be published.
- Treat the weekly public soak and regional validation as separate operational evidence.
