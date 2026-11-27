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
- `PATCH` changes only the fields sent. Send `expectedUpdatedAt` (the record's `updatedAt`) to get `409`
  instead of overwriting a newer change.
- Duplicate slugs and duplicate memberships return `409`.
- A name with no Latin letters or digits gets a generated slug (`item-xxxxxxxx`).
- Members must already have an active account; there is no invitation flow.

## Verification

`apps/api/src/tenancy-postgres.integration.test.ts` runs against development memory and, with
`IRP_TEST_DATABASE_URL`, a real PostgreSQL (required in CI).
