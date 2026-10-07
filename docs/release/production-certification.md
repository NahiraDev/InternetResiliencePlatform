# IRP Production Certification Harness

The production certification harness is the execution/evidence layer above the Phase 70 contract verifier.

## What it proves

A production certification is **PASS** only when every required evidence item in `ops/release/production-certification.json` is present with `status=pass`, all required evidence fields are populated, the evidence bundle contains no obvious secret material, and the bundle has a valid Ed25519 signature.

The harness can also probe a running Runtime Lab instance with `--runtime-url`. It records `/health`, `/ready`, and `/report` observations but never converts missing runtime evidence into PASS.

## Commands

```bash
pnpm production:certify
pnpm production:certify -- --runtime-url http://127.0.0.1:8080
pnpm production:certify -- --evidence path/to/evidence.json --require-complete
```

`--require-complete` is the release gate. Without it, an incomplete certification produces a machine-readable `PENDING` report instead of pretending that certification succeeded.

## Evidence contract

Each required evidence item must contain:

- `id`
- `status` (`pass`, `fail`, or `pending`)
- `observedAt`
- `source`
- `commitSha`
- `artifactSha256`

The bundle must also contain an Ed25519 signature over the unsigned JSON payload. Credentials, private keys, tokens, and similar secret material must never be placed in evidence.

## Output

The harness writes:

- `artifacts/production-certification/certification-report.json`
- `artifacts/production-certification/certification-report.sha256`

These are evidence records, not a certification by themselves. Final certification remains blocked until the required real-world runtime, device, regional, recovery, security, artifact, and release evidence is supplied and independently verified.
