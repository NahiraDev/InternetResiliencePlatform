# Organizations, projects and workspaces

Persistent in PostgreSQL (`Organization`, `Project`, `Workspace`, `Membership`, `Role`). All routes need a
bearer access token and are listed in the OpenAPI document (`/docs`).

## Access

| Caller                | Can                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------- |
| `viewer` member       | read the organization, its members, projects and workspaces                           |
| `member`              | viewer, plus create and update projects and workspaces                                |
| `admin`               | member, plus update the organization, manage members, archive projects and workspaces |
| owner (`ownerUserId`) | admin, plus archive the organization and transfer ownership                           |
| `platform_admin`      | everything, in every organization                                                     |

- Creating an organization requires the `organizations:write` permission; the creator becomes the owner.
- Inside an organization, access comes from ownership or an active membership, not from global permissions.
- Projects and workspaces have no membership of their own; access is inherited from the organization.
- Resources you cannot see return `404`; a visible resource with too low a role returns `403`.
- Every write rechecks the role inside its database transaction, so a role revoked while a request is in
  flight still stops it.
- A membership whose stored role is not `admin`, `member` or `viewer` grants nothing.
- The three global lists return `403` to a user with neither the read permission nor any organization.

## Endpoints (prefix `/api/v1`)

| Method and path                                                                | Purpose                                                            |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `GET`, `POST /organizations`                                                   | list, create                                                       |
| `GET`, `PATCH`, `DELETE /organizations/{id}`                                   | read, update (`name`, `slug`), archive                             |
| `POST /organizations/{id}/ownership`                                           | transfer to an active member (`userId`)                            |
| `GET`, `POST /organizations/{id}/members`                                      | list, add (`email` or `userId`, `role`)                            |
| `PATCH`, `DELETE /organizations/{id}/members/{userId}`                         | change `role` / `status`, remove or leave                          |
| `GET /projects`, `GET`, `POST /organizations/{id}/projects`                    | list, create (`name`, `slug`, `description`)                       |
| `GET`, `PATCH`, `DELETE /projects/{id}`                                        | read, update (`name`, `slug`, `description`), archive              |
| `GET /workspaces`, `GET /organizations/{id}/workspaces`                        | list                                                               |
| `POST /organizations/{id}/workspaces`, `GET`, `POST /projects/{id}/workspaces` | create, list by project                                            |
| `GET`, `PATCH`, `DELETE /workspaces/{id}`                                      | read, update (`name`, `slug`, `environment`, `projectId`), archive |

## Behaviour

- Lists accept `page`, `pageSize` (max 100), `sort`, `order`, `search` and return `meta.total`.
- `DELETE` archives (`deletedAt`). Archiving an organization archives its projects and workspaces; archiving
  a project archives its workspaces. Slugs of archived records stay reserved.
- A project cannot change organization. A workspace can move only to a project of its own organization and
  cannot be detached from a project through an update.
- `PATCH` changes only the fields sent and **requires** `expectedUpdatedAt` (the record's current
  `updatedAt`), for organizations, projects, workspaces and members. Without it the request is `400`; if
  the record changed since, it is `409`. Reload and retry.
- Concurrent ownership transfers: one wins, the others get `409` (or `403` if they were authorized after
  the winner committed).
- Duplicate slugs and duplicate memberships return `409`.
- A name with no Latin letters or digits gets a generated slug (`item-xxxxxxxx`).
- Members must already have an active account; there is no invitation flow.

## Quotas

Each organization has limits on live projects, workspaces and members (the owner does not count). A create
beyond the limit returns `409` with the resource and limit in the error details. Archived records and
removed members free their place; suspended members still count. Limits are checked under a per-organization
lock, so concurrent requests and multiple API instances cannot exceed them.

| Environment variable        | Default |
| --------------------------- | ------- |
| `IRP_TENANT_MAX_PROJECTS`   | `100`   |
| `IRP_TENANT_MAX_WORKSPACES` | `500`   |
| `IRP_TENANT_MAX_MEMBERS`    | `200`   |

A value that is not a positive integer stops start-up.

## Audit of denied access

Refused access to an existing tenant resource writes an `AuditLog` row with action `tenancy.access.denied`,
the actor, resource and id, source address, and `metadata` `{organizationId, reason, method, route}`.
`reason` is `not_a_member`, `insufficient_role` or `cross_tenant_parent`. Requests for ids that do not
exist are not recorded. There is no HTTP endpoint for reading the audit log.

## Verification

`apps/api/src/tenancy-postgres.integration.test.ts` runs against development memory and, with
`IRP_TEST_DATABASE_URL`, a real PostgreSQL (required in CI).
