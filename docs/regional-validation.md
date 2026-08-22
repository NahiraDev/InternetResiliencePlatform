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
                  ├── GitHub Step Summary
                  └── GitHub Actions artifact
```

The workflow is `.github/workflows/regional-validation.yml` and is `workflow_dispatch` only.

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
4. Open **Actions → Regional Validation → Run workflow**.
5. Leave `expected_country` as `IR`.
6. The `probe_url` can remain at its default unless a different trusted endpoint is available.
7. Inspect the JSON in the workflow Step Summary or download the `regional-validation-<run-id>` artifact.

If no matching runner is online, GitHub keeps the job queued instead of executing it on an unrelated hosted runner. citeturn1search7
