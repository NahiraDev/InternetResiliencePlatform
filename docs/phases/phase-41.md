# Phase 41 — External Regional Validation

**Status:** PLANNED / INITIAL TOOLING IMPLEMENTED

## Goal

Add an explicit online validation layer that can prove where a network probe actually egresses and can display the result as machine-readable evidence. The first required regional case is Iran (`IR`).

## Why this is separate from deterministic Phase 40

Phase 40 deliberately avoids dependence on Internet timing, remote infrastructure or destructive host changes. Phase 41 adds external evidence from a real network vantage point.

A GitHub runner or developer workstation outside Iran cannot be treated as an Iranian probe merely because it is testing an Iranian destination. Regional identity must come from the egress observed by the regional probe itself.

## Implemented tooling

`pnpm regional:online`

Implementation: `scripts/regional-online-test.mjs`

The command:

- requires an HTTPS probe endpoint;
- accepts a configurable expected country, default `IR`;
- applies a bounded timeout;
- rejects redirects;
- requires an observed public IP;
- requires an observed country/country_code;
- prints structured JSON containing status, egress IP, country and optional region/ASN/organization metadata;
- exits `0` on country match, `2` on country mismatch and `1` on transport/validation failure.

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
  "ip": "203.0.113.10",
  "country": "IR"
}
```

The example IP above is documentation-only and must never be used as test data for real routing.

## Evidence model

An external result is considered valid only when it contains:

- probe identity/label;
- observed public egress IP;
- observed country;
- timestamp/duration from the probe client;
- endpoint identity;
- optional region/ASN/organization metadata;
- pass/mismatch/failure state.

The result must not be interpreted as proof of service availability by itself. Service verification is a separate measurement dimension.

## Safety and privacy

- Never require a user to expose private LAN addresses.
- Do not log bearer tokens, credentials or cookies.
- Prefer a dedicated regional probe endpoint rather than arbitrary URL fetching.
- Keep the number of remote destinations bounded.
- Regional location is evidence for policy evaluation, not a guarantee of exact physical location; IP geolocation can be coarse or wrong, especially for mobile networks. Recent research documents substantial geolocation error variability across network types and regions. citeturn492492academia31

## Online sanity-check evidence

As an external cross-check, public lookup records currently identify `85.185.85.208` as Tehran, Iran (`IR`) and AS58224, while `2.184.173.224` is identified as Yasuj, Iran and AS58224. These are third-party geolocation records for example IPs, not proof that the current project runner is located in Iran. citeturn309235search5turn309235search2

## Completion criteria

- [ ] Actual Iranian regional probe endpoint exists and is reachable from an independent Iranian network.
- [ ] `pnpm regional:online` returns `status=passed` with `country=IR` from that vantage point.
- [ ] Service-level reachability checks are added for an explicit bounded target set.
- [ ] Results are captured as versioned evidence without secret leakage.
- [ ] CI/automation can consume regional evidence without treating remote failure as a local code failure.
