# Final Product Readiness Assessment

Date: 2026-11-28. Assessment only: no application code was changed.

**Verdict: not ready for production release.** 5 P0 and 11 P1 items are open for the first-release scope below.

## 0. Scope and method

**Assumed first-release scope** (owner to confirm): the hosted control-plane API plus the Linux device package. `PROJECT_STATE.md` and `docs/release/linux-primary-platform.md` name Linux as the first production target. Android, iOS, Windows and macOS are listed separately in section 4. `ROADMAP.md` describes full clients on all five platforms; if all must ship at once, the platform items in section 4 become release blockers too.

**Evidence used**

- Source at the SHA below, GitHub Actions, GitHub releases and issues, Vercel build logs, and Supabase project metadata (read-only).
- Local build; API started with `NODE_ENV=production` against a throwaway PostgreSQL 16 with fake credentials; routes called over HTTP.
- Test accounts were activated by editing the throwaway database, because no mail relay exists locally.
- Both Debian packages built; the daemon package installed and run in this container, then purged.

**Evidence labels:** *Reproduced* = observed by running it. *Code* = read in source or configuration, not executed. *Missing* = no evidence found.

**Independent review:** a second agent tried to refute the P0 and P1 findings from code and GitHub and refuted none on substance; its corrections are included. It did not re-run the reproductions.

**Not done:** no real Android, iOS, Windows or macOS device; no hosted production request (the Vercel alias is behind Vercel login); no load or soak run; Prisma CLI migrations not run locally (engine download blocked; the SQL files were applied with `psql`).

## 1. Verified main SHA

`d6fa748f4526a75845b30c6aa1bdf5e9335cd614` (merge of PR #564). No pull request was open when the assessment started. PR #565 (owner, `release/linux-enduser-ready`, head `a798ce26`) was opened during it: documentation and `scripts/install-linux.sh` only. It changes no finding below. Its GitHub check runs passed except `macos-client` (cancelled); both Vercel commit statuses on it failed with "Deployment was blocked" (cause not investigated).

| Check at this SHA | Result |
| --- | --- |
| CI (repository validation, Debian 13 package, network-namespace chain, architecture) | success, run 46090660952 |
| System Assurance, Runtime Lab, CodeQL | success |
| Docker Publish | **failure**, run 46091954089 |
| Vercel `internet-resilience-platform-api` production | **ERROR**, `dpl_8gPoCT3FNgjBMUip9pX4ZFNgNrmP` |
| Vercel `my-repo` | rate limited |

Platform client workflows run on pull requests only, so they did not run on this SHA. On PR #564 `macos-client` was cancelled (unsupported runner configuration).

The previous main CI runs I listed (`2a980afc`, `4a8f9ea8`, `3f30d791`, `97abdb91`) all failed; `d6fa748f` is the first green one after them.

**Local run:** build passed (44/44 tasks). Tests: 87/88 tasks passed; `apps/api` 245/245 with PostgreSQL. The one failure, `packages/gateway-registry/src/probe.test.ts` (expects a timeout, got `ECONNREFUSED`), depends on this container's network; CI passed on the same SHA.

## 2. Actual product capabilities

| Area | What works | Evidence |
| --- | --- | --- |
| API startup | Starts in production mode; refuses missing database, mail relay or public URL; `/api/v1/ready` checks the database | Reproduced |
| Identity | Register, token-based email confirmation, login, sessions revocable server-side, bootstrap administrator via `IRP_BOOTSTRAP_ADMIN_EMAILS` | Reproduced |
| Authorization | Anonymous and unprivileged callers get 401/403 on admin, runtime, autopilot, intent and incident routes | Reproduced |
| Organizations | Create, add member; member sees own organization; outsider gets 404 | Reproduced; PostgreSQL integration tests |
| Remote device credentials | Admin enrollment, token exchange, a device cannot read another device's path | Reproduced |
| Persistence | Identity, tenancy, subscriptions, remote credentials and settings are PostgreSQL-backed | Code; integration tests |
| Linux network recovery | Real kernel route change, destination verification, commit and rollback in a network namespace | `packages/linux-client/src/linux-chain.e2e.test.ts`, CI job "Linux network-namespace end-to-end chain" |
| `irp-linux-client` package | Builds, installs on `debian:13` and passes a smoke test | CI "Linux primary device"; built locally |
| Observability | Structured request and error logs, metrics endpoint, telemetry setup | Reproduced (logs, `/api/v1/metrics`) |
| Backup rehearsal script | Dump and restore with row-count check works | Reproduced locally (33 tables, 42 rows, with a hand-made `_prisma_migrations` table) |

**Limits of these capabilities**

- The API's resilience runtime is built with `executionMode: 'simulation'` (`apps/api/src/index.ts`). Host network changes happen only on a Linux device.
- Neither `apps/daemon` nor `packages/linux-client` calls the control-plane API. The Linux device is standalone.

## 3. Production blockers (P0)

### P0-1. Hosted production cannot deploy

- **Component:** Vercel production environment; `scripts/validate-production-api-env.mjs` (working as intended).
- **Status (Reproduced from build log):** the preflight rejects the build. `DATABASE_URL` points to loopback and is not the TLS-verified transaction pooler with the `irp_runtime` role; `IRP_PUBLIC_BASE_URL` and `IRP_EMAIL_WEBHOOK_URL` are missing.
- **Related:** the Supabase project `irp-production` exists and reports healthy. `docs/guides/production-database.md` states the `irp_runtime` role has no password yet (not verified here). The most recent production build Vercel lists as `READY` that I saw is `d1a60714`, behind current main; GitHub reports that deployment's checks as failed, and I did not verify which build the production domain serves.
- **Existing tests:** `apps/api/src/production-env.test.mjs`.
- **Missing acceptance:** a production deployment of the release SHA with `/api/v1/ready` returning 200 and `database: healthy`; one real verification email delivered.
- **Type:** owner configuration. No code change. Issue #411.

### P0-2. Verification and password-reset links lead to 404

- **Component:** `apps/api/src/identity/auth-service.ts` (line 91 builds `<IRP_PUBLIC_BASE_URL>/verify-email?token=` and `/reset-password?token=`).
- **Status (Reproduced):** the API returns 404 for both paths. I found no page in `apps/web` or `apps/api/src/dashboard.ts` that consumes the token. The POST confirm endpoints work.
- **Existing tests:** `apps/api/src/auth-lifecycle.test.ts` exercises the API endpoints; nothing follows the emailed link.
- **Missing acceptance:** clicking the emailed link verifies the account, and the reset link sets a new password.
- **Note:** if `IRP_PUBLIC_BASE_URL` is a separate site that serves these paths, that site is not in this repository.

### P0-3. `irp-daemon` Debian package does not run away from its build machine

- **Component:** `scripts/build-linux-daemon-deb.sh` (`pnpm deploy --legacy`).
- **Status (Reproduced):** the package contains 20 symlinks into the build checkout's `packages/` directory. With that directory hidden, the installed daemon and CLI both fail with `ERR_MODULE_NOT_FOUND` (`@irp/core`, `@irp/config`).
- **Existing tests:** none. No workflow builds this package; CI covers only `irp-linux-client`. `docs/operations/linux-enduser-guide.md` recommends the daemon package to end users.
- **Source installer:** `scripts/install-linux.sh` uses the same deploy command. A deploy of `@irp/daemon` left 13 `@irp` links pointing into the checkout, so that installation depends on the checkout staying in place (the script itself was not run).
- **Missing acceptance:** build in CI, install on a clean `debian:13` with no checkout, `systemctl start irp-daemon`, `irp status` succeeds.

### P0-4. No installable release has been produced

- **Component:** `.github/workflows/release.yml`.
- **Status (Reproduced from GitHub):** the only GitHub release, `v0.2.3`, has no assets. The latest tag run (`v0.3.0`, run 41933641608) was cancelled after the Android build failed, so publishing was skipped. The other release runs listed failed. The workflow builds neither Debian package; its Linux asset is a `.tar.gz` of `linux-client`.
- **Existing tests:** `scripts/phase71-release.test.mjs`, `scripts/package-linux-bundle.test.mjs`.
- **Missing acceptance:** a tag run on the release SHA that publishes the Linux package and checksums.
- **Note:** the workflow has changed since those runs may have executed; its current version has not been run.

### P0-5. No customer can activate a subscription or enroll a subscription device

- **Component:** `apps/api/src/subscription-api.ts`, `packages/database/prisma/migrations`.
- **Status (Reproduced and Code):** no migration or script inserts a `SubscriptionPlan`, so `/api/v1/subscriptions/plans` is empty and purchase returns 404. I found no route that creates plans. Payment verification accepts only the `test` provider, which production rejects; any other provider throws "not configured". `/api/v1/devices/enroll` then returns 403.
- **Existing tests:** `apps/api/src/subscription-payment-guard.test.ts` (inserts its own plan).
- **Missing acceptance:** a verified user obtains an entitlement and enrolls a device in production mode.
- **Owner decision needed:** integrate a payment provider, add manual administrator activation, or remove subscriptions from the first release. Admin-issued remote device credentials work without a subscription.

## 4. Missing real-world acceptance tests

| Area | State | Missing |
| --- | --- | --- |
| Linux | Package install and namespace chain in CI | Run on a real machine: boot, reboot, upgrade, uninstall, real link failure and recovery |
| Long-running stability | Weekly public soak: last two runs failed in setup steps (45012717279, 43702673350); earlier ones succeeded on older SHAs | Soak of the release SHA (#323) |
| Multi-device | Missing | Two or more enrolled devices against one control plane |
| Network failure and recovery | Namespace tests; database saturation test | Real WAN loss; database outage and recovery on the hosted deployment |
| Production database | Rehearsal only on a local database | Restore rehearsal from `irp-production`; scheduled backups (#411) |
| Regional validation | Runs listed were cancelled | One successful run, if required for release |
| Android | Unit tests and debug APK on pull requests | Device run. See below |
| iOS | Simulator build, unsigned | Signing, device run |
| Windows, macOS | Typecheck, lint, unit tests | Installer, device run. Both are packages with no installer |

**Platform defects (outside first-release scope unless the platform ships)**

- **Android app crashes at start as built (Code, not run on a device):** `res/values/strings.xml` has an empty `irp_control_plane_base_url`; `MainActivity.onCreate` passes it to `HttpControlPlaneClient.create`, which uses `require(isNotBlank)` with no handler. See P1-11 because `release.yml` would publish this APK.
- **Android VPN (Code):** the default transport `UnavailablePacketForwardingTransport` always returns false.
- **iOS VPN (Code):** `runTransport` in `PacketTunnel/PacketTunnelProvider.swift` always throws `transportUnavailable`.
- **iOS configuration:** `IRPControlPlaneBaseURL` is empty (handled without a crash); distribution is source only.

## 5. Existing completed functionality (do not rebuild)

- Fail-closed production configuration and mail-relay requirement.
- PostgreSQL repositories for identity, sessions, tenancy, remote credentials, settings, rate limits (#410 source work; the issue is still open).
- Organization, project and workspace management; Phase 119 tenant-isolation hardening.
- Linux observe, route, verify and rollback chain with privilege gates.
- `irp-linux-client` packaging and install test.
- Production database schema documented as applied on `irp-production`. Supabase's own migration list is empty, which is expected if Prisma history is in `_prisma_migrations` (not queried). The only security advisory is an informational one on that table.
- Docker image build and the Compose smoke test.

## 6. Remaining work

### P1: must fix before production

| ID | Component | Status and evidence | Missing acceptance | Existing tests |
| --- | --- | --- | --- | --- |
| P1-1 | `apps/api/src/index.ts` ~1426, `POST /api/v1/remote/devices/:deviceId/policy` | Reproduced: a device token holding only read scopes switched the **server-wide** runtime to `live`; an admin snapshot confirmed it. `requiredPermissions: []`. Code: `requireRemoteClient` only verifies the token signature and expiry, with no revocation lookup, so a revoked device keeps access until its token expires (900 s) | Write needs a write scope or admin; one device cannot change global state | `device-data-plane.test.ts` (this refusal not covered, as far as read) |
| P1-2 | Same file ~1362-1414; `apps/daemon` | Reproduced/Code: device snapshot and analytics return the API server's own measurements; no route receives device telemetry; the daemon never calls the API. P0 if remote device monitoring is promised | Device data comes from the device, or the claim and screens are removed | none for real device data |
| P1-3 | `.github/workflows/docker-publish.yml` | Reproduced: scan reference omits the owner (`ghcr.io/internetresilienceplatform@…`, `NAME_INVALID`). The image is pushed **before** the scan, so `sha-d6fa748` was pushed unscanned and unsigned | Correct reference; unscanned images are not left published; a green publish run with signature | `scripts/docker-publication-policy.test.mjs` (tags only) |
| P1-4 | `apps/api/src/index.ts:1227`, `POST /api/v1/probes/run` | Reproduced: anonymous caller triggers outbound network probes; no pre-handler or rate limit | Authentication and rate limit | none found |
| P1-5 | `apps/api/src/subscription-api.ts:46` | Reproduced: anonymous `GET /api/v1/devices` and `/admin/subscriptions` return 500, not 401. Clients cannot tell an expired session from a server fault | 401 for missing or expired token | none found |
| P1-6 | `compose.yaml` | Code: `IRP_BOOTSTRAP_ADMIN_EMAILS` is not passed to the API container, so a Compose deployment cannot create its first administrator without a Compose override or a database edit | First admin can be created in a Compose deployment | `docker-smoke.sh` does not check it |
| P1-7 | `scripts/ops/db-restore-rehearsal.sh`, #411 | Missing: no run against production; no schedule. The guide says the free plan has no scheduled backups (plan not verified) | Recorded restore from production; backup schedule; alert on failure | local rehearsal only |
| P1-8 | Linux runtime, #323 | Missing: no soak or real-machine evidence for the release SHA | Recorded soak and failure-recovery run on the release SHA | CI namespace chain |
| P1-9 | Packaging, `packages/database/prisma/rollbacks` | Missing: no install-over-previous or rollback acceptance; 2 of 8 migrations have rollback files | Upgrade and rollback of the package and of the API with its schema, executed once and written down | version-ordering assertion; fresh install |
| P1-10 | `package.json` files, tags, `CHANGELOG.md` | Code: root and most apps `0.1.0`, `apps/daemon` and `packages/linux-client` `0.3.0-prerelease`; tag `v0.3.0` already exists with no release | One version scheme and an unused release tag | none |
| P1-11 | `release.yml`, `clients/android` | Code: release would publish a debug APK that crashes at start | Configure the URL and launch on a device, or drop the APK from the release | Android unit tests do not launch the activity |

### P2: important, can follow the first release

| Item | Evidence |
| --- | --- |
| Federation routes answer 503 in production (no durable store) | Reproduced; deliberate fail-closed |
| Anonymous access to `/api/v1/platform/status`, `/measurements`, `/metrics`, `/docs` | Reproduced; confirm it is intended |
| Ordinary users cannot create organizations (members have no permissions) | Reproduced; product decision |
| Dependency advisories. Full `pnpm audit`: 2 critical, 2 high, 8 moderate, 1 low (matches GitHub's count of 13). Both criticals are `tinypool` through `vitest`, and one high is `vite`: development tooling, which the `Dockerfile` leaves out of the runtime image. `pnpm audit --prod`: 1 high (`effect`, through `prisma`), 2 moderate | Reproduced; reachability not analysed; Dependabot alert details not readable (403) |
| Stray files in repository root: `workspace.patch` (2231 lines), `compose.dev.yaml.bak-*` | Code |
| `RELEASE_GATE_ROADMAP.md` says a `latest` image tag is published; the policy forbids it | Code |
| `compose.yaml` publishes PostgreSQL port 5432 on the host | Code |
| `fly.toml` sets no database or mail configuration and conflicting memory values | Code; confirm whether Fly is a target |
| `gateway-registry` timeout test depends on the network it runs in | Reproduced |
| `macos-client` runner configuration unsupported | PR #564 check |

### P3: future enhancement

- Autonomous egress provisioning without a user-owned server (#463).
- Kubernetes and Terraform (`infra/` holds placeholder READMEs only).
- Android and iOS packet forwarding, Windows and macOS installers, if those platforms are outside the first release.
- DNS writes by the non-root daemon (documented as intentionally disabled).

## 7. Shortest path to production release

1. **Confirm scope** (owner): Linux plus hosted API; subscriptions in or out (P0-5).
2. **P0-3:** self-contained `irp-daemon` package, built and install-tested in CI.
3. **P0-4 with P1-10, P1-11:** release workflow publishes that package under a fresh version; no broken APK.
4. **P0-2, P1-5:** working email link pages and correct 401s.
5. **P1-1, P1-4:** close the device policy write and anonymous probe.
6. **P1-3, P1-6:** fix image publication; pass the bootstrap admin variable.
7. **P0-1** (owner): set production variables and the database role password; deploy the release SHA.
8. **P0-5:** implement the chosen subscription path.
9. **P1-2:** connect device data, or remove the remote monitoring claim.
10. **Acceptance on the release SHA:** P1-7, P1-8, P1-9.
11. Tag and publish.

Steps 2 to 6 need no hosted access. Step 7 can run in parallel.
