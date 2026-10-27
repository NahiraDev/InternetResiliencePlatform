# Docker Publication Policy

Docker Publish consumes successful CI Release Gate results for the exact current
`main` commit. This permits a **developer-preview** container; it does not establish
Phase 70 production certification or a stable production release.

## Developer-preview publication

- The checked-out commit must equal both current `main` and the triggering
  successful Release Gate's source SHA.
- The only permitted tag is `ghcr.io/<owner>/<repository>:sha-<first-seven-SHA-characters>`.
  The runtime policy guard rejects `latest`, version tags, wrong-source tags,
  another repository, and unexpected additional tags before pushing.
- Metadata explicitly disables automatic `latest` generation and records the full
  source SHA plus the `developer-preview` publication class.
- Build provenance, SBOM generation, digest-bound Cosign signing, and digest
  reporting remain required. A preview image signature proves its CI publication
  identity, not independent production certification.
- A fail-closed Trivy image scan by immutable digest runs after the image is
  pushed and before cosign signing. Missing, failed, or unreviewed
  HIGH/CRITICAL findings fail the workflow so Release Gate cannot pass with an
  unverified image. The scanned digest and JSON result are preserved as a
  workflow artifact (`trivy-image-scan`).

## Latest promotion

**BLOCKED.** No trusted production-certification/release authority is configured,
so this workflow has no permitted path to promote `latest`, even after a successful
CI Release Gate. An environment flag, a prerelease, an unsigned report, or a bundle
using its own untrusted public key cannot supply that authority.

Future production promotion requires a separately reviewed, independently trusted
certification/release verifier binding all mandatory production evidence to the
exact source commit and artifact digest. It must verify the trusted signer and
completed release authorization before any mutable production-tag update; adding
a boolean flag or removing this guard is not a certification mechanism.

See [production certification](production-certification.md),
[Phase 70 contract](../../ops/release/phase-70-certification.json), and
[the evidence contract](../../ops/release/production-certification.json).

## Existing registry state

This policy does not delete, manually retag, or rewrite images already published.
An existing `latest` created under the prior policy is legacy registry state, not
evidence of certified production approval. Pin a verified preview digest rather
than treating a mutable tag as certification.

## Focused validation

```sh
node --test scripts/docker-publication-policy.test.mjs
```

The tests run as a mandatory Docker Publish step before registry publication.
