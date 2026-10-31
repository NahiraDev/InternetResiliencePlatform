# Docker Publication Policy

Docker Publish is triggered by a completed CI workflow run. Publication is
allowed only when that run succeeded, originated from a push to main, and its
source SHA still equals the current main commit.

## Developer-preview publication

- The checked-out commit must equal both current main and the triggering
  successful CI run's exact source SHA.
- The only permitted tag is
  `ghcr.io/<owner>/<repository>:sha-<first-seven-SHA-characters>`.
- The publication policy script rejects latest, version tags, wrong-source
  tags, another repository, and unexpected additional tags before pushing.
- Metadata disables automatic latest generation and records the full source
  SHA and developer-preview publication class.
- Build provenance, SBOM generation, digest-bound Cosign signing, and digest
  reporting remain required.
- A fail-closed Trivy scan runs against the exact pushed digest before signing.
  HIGH/CRITICAL findings fail the workflow.

A preview image signature proves its CI publication identity. It does not prove
independent production certification.

## Latest promotion

BLOCKED. No trusted production-certification/release authority is configured.
This workflow has no permitted path to promote latest.

Future production promotion requires a separately reviewed, independently
trusted verifier binding mandatory production evidence to the exact source
commit and artifact digest. A boolean flag or successful CI run is not a
certification mechanism.

## Existing registry state

This policy does not delete, manually retag, or rewrite existing images.
An existing latest tag is legacy registry state, not evidence of production
approval. Pin a verified preview digest rather than trusting a mutable tag.

## Focused validation

Run:

    node --test scripts/docker-publication-policy.test.mjs

The policy test and enforcement script run before registry publication.
