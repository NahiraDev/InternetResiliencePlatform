# Regional Validation

Regional validation is deliberately **not part of the standard GitHub-hosted CI**. GitHub-hosted runners execute in GitHub/Azure infrastructure and therefore cannot be treated as an Iranian network vantage point. citeturn0search1turn0search2

## Architecture

```text
Standard CI
  └── ubuntu-latest
      └── no regional probe

Regional Validation (manual)
  └── self-hosted runner
      └── label: iran
          └── pnpm regional:online
              └── regional-validation.json
                  └── retained by the regional evidence operator
```

Regional evidence is intentionally run by the operator on the self-hosted runner rather than by a repository workflow. This prevents GitHub-hosted CI from being misrepresented as a regional vantage point.

## Regional runner requirement

Register a self-hosted Linux runner on a machine that is actually connected through the regional network being measured, then give it the custom label `iran`. GitHub supports custom labels for self-hosted runners and routes a job only when all requested labels match. citeturn1search2turn1search3

The workflow targets:

```yaml
runs-on: [self-hosted, linux, iran]
```

This prevents the regional workflow from silently falling back to `ubuntu-latest`.

## Probe endpoint

The default probe endpoint is `https://ipapi.co/json/`. The request is made **from the regional self-hosted runner**, so the returned IP/country describes the runner's observed egress rather than the GitHub-hosted CI environment.

The endpoint must return JSON containing:

- `ip` or `ip_address`
- `country` or `country_code`

The result is evidence rather than absolute proof of physical location; geolocation accuracy can vary by provider and network type.

## Running it

1. Add a self-hosted Linux runner to the repository.
2. Assign the custom label `iran`.
3. Keep the runner online.
4. Run `pnpm regional:online -- --endpoint https://<trusted-regional-probe> --country IR` on that runner.
5. Retain the command output as the regional evidence artifact.

The command requires an explicit HTTPS probe endpoint; it does not substitute a public geolocation service or a GitHub-hosted runner for the required regional vantage.
