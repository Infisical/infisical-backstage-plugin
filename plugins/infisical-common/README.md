# @infisical/backstage-plugin-infisical-common

Shared types, annotation keys and permission definitions for the Infisical
Backstage plugins (`@infisical/backstage-plugin-infisical` and
`@infisical/backstage-backend-plugin-infisical`).

## Permissions

All permissions use the `catalog-entity` resource type, so permission policies
can reuse the catalog's conditional rules (for example `isEntityOwner`) with the
entity the secrets are being accessed through.

| Permission                    | Action   | Gates                                     |
| ----------------------------- | -------- | ----------------------------------------- |
| `infisical.secret.read`       | `read`   | Listing secrets, folders and environments |
| `infisical.secret.value.read` | `read`   | Revealing secret values                   |
| `infisical.secret.create`     | `create` | Creating secrets                          |
| `infisical.secret.update`     | `update` | Updating secrets                          |
| `infisical.secret.delete`     | `delete` | Deleting secrets                          |

See the root README of the repository for an example policy.
