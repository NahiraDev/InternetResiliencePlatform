# Phase 41 — External Regional Validation

**Status:** INITIAL TOOLING IMPLEMENTED / IRANIAN VANTAGE PENDING

## Goal

Add an explicit online validation layer that can prove where a network probe actually egresses and display the result as versioned machine-readable evidence. The first required regional case is Iran (`IR`).

## Why this is separate from deterministic Phase 40

Phase 40 deliberately avoids dependence on Internet timing, remote infrastructure or destructive host changes. Phase 41 adds external evidence from a real network vantage point.

A GitHub runner or developer workstation outside Iran cannot be treated as an Iranian probe merely because it is testing an Iranian destination. Regional identity must come from the egress observed by the regional probe itself.

## Implemented tooling

```bash
pnpm regional:online
```

Implementation: `scripts/regional-online-test.mjs`.

The command:

- requires an explicit HTTPS regional probe endpoint;
- accepts a configurable expected country, default `IR`;
- applies a bounded timeout;
- rejects redirects;
- requires an observed egress IP;
- requires an observed `country`/`country_code`;
- prints structured JSON containing status, egress IP, country and optional region/ASN/organization metadata;
- exits `0` on country match, `2` on country mismatch and `1` on transport/validation failure.

There is intentionally no default public geolocation endpoint. A public geolocation service may be used by the regional probe itself, but the project runner must not treat a generic public API response as evidence of an Iranian vantage point.

## Actual Iran-origin test contract

Run from an independent Iranian network vantage point:

```bash
IRP_REGIONAL_PROBE_URL=https://<trusted-iranian-probe>/identity \
IRP_EXPECTED_COUNTRY=IR \
pnpm regional:online
```

The endpoint must return at least:

```json
{
  "ip": "<observed-egress-ip>",
  "country": "IR"
}
```

## GitHub Actions automation

`.github/workflows/regional-validation.yml` provides a manual `workflow_dispatch` job. It requires the operator to supply the explicit probe URL and expected country, prints the structured result into `$GITHUB_STEP_SUMMARY`, and uploads the JSON evidence as a workflow artifact.

This workflow is intentionally not part of the normal repository CI gate because a missing/unavailable external regional vantage point is an environmental validation failure, not a source-code failure.

## Evidence model

An external result is valid only when it contains:

- probe identity/label;
- observed public egress IP;
- observed country;
- timestamp/duration from the probe client;
- endpoint identity;
- optional region/ASN/organization metadata;
- pass/mismatch/failure state.

Regional identity is evidence for policy evaluation, not an absolute guarantee of physical location. IP geolocation can be coarse or wrong, especially for mobile and carrier networks.

## Completion criteria

- [ ] Actual Iranian regional probe endpoint exists and is reachable from an independent Iranian network.
- [ ] `pnpm regional:online` returns `status=passed` with `country=IR` from that vantage point.
- [ ] Service-level reachability checks are added for an explicit bounded target set.
- [ ] Results are captured as versioned evidence without secret leakage.
- [ ] Regional evidence can be consumed by automation without treating remote environmental failure as a local code failure.

## Status / Verification

**Implementation status:** tooling and CI workflow are implemented.

**Verification status:** repository-side implementation is reviewable and testable, but independent Iranian regional evidence remains pending. The phase must not be marked fully complete until the completion criteria above are satisfied, including a real Iranian egress observation.

**CI interpretation:** failure to access the independently hosted regional probe is an environmental validation failure and is intentionally outside the normal repository CI gate.
