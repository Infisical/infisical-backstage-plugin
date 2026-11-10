# Backstage Infisical Plugin

![Backstage Loves Infisical](https://img.shields.io/badge/Backstage-loves%20Infisical-blue)
![License](https://img.shields.io/github/license/your-username/backstage-plugin-infisical)

A comprehensive Backstage plugin suite that integrates with [Infisical](https://infisical.com) for secrets management. This project consists of both frontend and backend plugins to help you manage secrets directly in your Backstage instance.

## Features

- **View & Manage Secrets**: Browse, create, update, and delete secrets stored in Infisical
- **Folder Navigation**: Browse through the folder structure of your Infisical projects
- **Environment Support**: Manage secrets across different environments (Development, Staging, Production)
- **Entity Integration**: Connect Backstage entities to Infisical projects
- **Multiple Machine Identities**: Give each entity, or each of its environments, its own Infisical machine identity, and see the Backstage user in Infisical's audit log

## Installation

### Frontend Plugin

```bash
# From your Backstage root directory
yarn --cwd packages/app add @infisical/backstage-plugin-infisical
```

### Backend Plugin

```bash
# From your Backstage root directory
yarn --cwd packages/backend add @infisical/backstage-backend-plugin-infisical
```

### Common Package

`@infisical/backstage-plugin-infisical-common` ships the permission definitions and annotation keys shared by both plugins. It is installed automatically as a dependency of the frontend and backend plugins. Add it to your backend only if you reference the permissions in a custom permission policy:

```bash
# From your Backstage root directory
yarn --cwd packages/backend add @infisical/backstage-plugin-infisical-common
```

> **Breaking change:** the backend API is now entity-based (the frontend sends an `entityRef` instead of a `workspaceId`) and every route is protected by the permission framework. The frontend and backend plugins must be upgraded together.

## Configuration

### Backend Configuration

Add the following to your `app-config.yaml` to configure the backend plugin:

```yaml
infisical:
  baseUrl: https://app.infisical.com  # Optional, defaults to https://app.infisical.com
  
  # You must configure one of the following authentication methods:
  authentication:
    # Option 1: API Token Authentication
    auth_token:
      token: ${INFISICAL_API_TOKEN}
    
    # Option 2: Client Credentials Authentication
    universalAuth:
      clientId: ${INFISICAL_CLIENT_ID}
      clientSecret: ${INFISICAL_CLIENT_SECRET}
```

#### Multiple machine identities

By default every request from Backstage reaches Infisical as the single identity configured under `authentication`. To tell teams, entities or environments apart in Infisical, configure additional named identities and let entities select them with the `infisical/identity` annotations (see [Entity Configuration](#entity-configuration)):

```yaml
infisical:
  baseUrl: https://app.infisical.com
  # Default identity, used by entities without an infisical/identity annotation.
  # Optional when identities are configured.
  authentication:
    universalAuth:
      clientId: ${INFISICAL_CLIENT_ID}
      clientSecret: ${INFISICAL_CLIENT_SECRET}
  identities:
    payments-dev:
      universalAuth:
        clientId: ${INFISICAL_PAYMENTS_DEV_CLIENT_ID}
        clientSecret: ${INFISICAL_PAYMENTS_DEV_CLIENT_SECRET}
    payments-prod:
      universalAuth:
        clientId: ${INFISICAL_PAYMENTS_PROD_CLIENT_ID}
        clientSecret: ${INFISICAL_PAYMENTS_PROD_CLIENT_SECRET}
      # Optional: only these entities may use this identity (others get 403)
      allowedEntityRefs:
        - component:default/payments-service
```

- Each identity accepts the same `auth_token` or `universalAuth` block as `authentication`.
- Identity names are Backstage config keys: letters and digits, optionally separated by `-` or `_`, with each part starting with a letter (`payments-dev` works, `team-1` does not).
- Without `allowedEntityRefs`, any entity can reference the identity. Since anyone who can edit a `catalog-info.yaml` can set the annotation, use the allowlist for identities with broad access.
- Every identity needs access to the entity's Infisical project in Infisical itself.

#### Audit trail in Infisical

Each request to Infisical is made as the selected machine identity, so the actor of every [audit log](https://infisical.com/docs/documentation/platform/audit-logs) entry shows which identity, and therefore which entity or environment, was used. The backend also sends the Backstage user and entity in the `User-Agent` header, which Infisical stores with each audit log entry:

```text
backstage-plugin-infisical (user=user:default/jane; entity=component:default/payments-service)
```

Requests made by other backend plugins show `user=service:<subject>`. The User-Agent is informational and set by your Backstage backend, so treat it as a tracing aid rather than proof of identity.

Add the plugin to your backend in `packages/backend/src/index.ts`:

```typescript
import { createBackend } from '@backstage/backend-defaults';

const backend = createBackend();

// ... other plugins
backend.add(import('@infisical/backstage-backend-plugin-infisical'));

backend.start();
```

### Frontend Configuration

1. Add the plugin to your Backstage application by modifying your `packages/app/src/App.tsx`:

```tsx
import { infisicalPlugin } from '@infisical/backstage-plugin-infisical';

const app = createApp({
  // ... other configuration
  plugins: [
    // ... other plugins
    infisicalPlugin,
  ],
});
```

2. Add the Infisical tab to your entity page in `packages/app/src/components/catalog/EntityPage.tsx`:

```tsx
import { EntityInfisicalContent } from '@infisical/backstage-plugin-infisical';

// Add to the service entity page:
const serviceEntityPage = (
  <EntityLayout>
    {/* ...other tabs */}
    <EntityLayout.Route path="/infisical" title="Secrets">
      <EntityInfisicalContent />
    </EntityLayout.Route>
  </EntityLayout>
);
```

### Entity Configuration

To connect an entity to its Infisical project, add the following annotation to your entity yaml file:

```yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: example-service
  annotations:
    infisical/projectId: <your-infisical-project-id>
    infisical/environment: "staging"
    infisical/secretPath: "+/folder/nested"
```

| Annotation | Required | Description |
|------------|----------|-------------|
| `infisical/projectId` | ✅ | The ID of your Infisical project |
| `infisical/environment` | ❌ | Lock the view to a specific environment (e.g., "development", "staging", "production") |
| `infisical/secretPath` | ❌ | Specify the folder path to display secrets from |
| `infisical/identity` | ❌ | Name of the machine identity from `infisical.identities` to use. Defaults to `infisical.authentication` |
| `infisical/identity.<environment>` | ❌ | Machine identity to use for one environment, e.g. `infisical/identity.prod`. Overrides `infisical/identity` for that environment |

#### Machine Identity Selection

An entity can use several machine identities, for example a separate identity per environment:

```yaml
metadata:
  annotations:
    infisical/projectId: <your-infisical-project-id>
    infisical/identity: payments-dev        # default for this entity
    infisical/identity.prod: payments-prod  # used for the prod environment
```

For each request the backend picks `infisical/identity.<environment>` when the request targets that environment, otherwise `infisical/identity`, otherwise the default `infisical.authentication` identity. Listing environments targets no environment (unless the entity is locked with `infisical/environment`), so the identity from `infisical/identity` or the default identity must be able to read the project.


#### Secret Path Behavior

The `infisical/secretPath` annotation controls both the starting location and navigation permissions:

**Without "+" prefix (restricted navigation):**
```yaml
infisical/secretPath: "/folder/nested"
```
- Shows secrets only from the specified path
- **Disables** folder navigation - users cannot navigate to subfolders
- Ideal for restricting access to a specific folder level

**With "+" prefix (allowed navigation):**
```yaml
infisical/secretPath: "+/folder/nested"
```
- Shows secrets starting from the specified path (without the "+")
- **Enables** folder navigation - users can navigate to subfolders
- Ideal for setting a starting point while allowing exploration

**Examples:**

| Configuration | Behavior |
|---------------|----------|
| `infisical/secretPath: "/api/config"` | View only `/api/config`, no subfolder navigation |
| `infisical/secretPath: "+/api/config"` | Start at `/api/config`, allow navigation to subfolders |
| No `secretPath` annotation | Start at root (`/`), allow full navigation |

## Permissions

Both plugins integrate with the [Backstage permission framework](https://backstage.io/docs/permissions/overview). The backend enforces every permission; the frontend only uses them to hide controls the user cannot use.

All permissions use the `catalog-entity` resource type with the entity the secrets are accessed through as the resource. This means your policy can reuse the catalog's conditional rules such as `isEntityOwner`, and the catalog backend evaluates the conditions. No extra rules need to be registered for this plugin.

| Permission | Action | Gates |
|---|---|---|
| `infisical.secret.read` | `read` | Listing secrets, folders and environments (`GET /secrets`, `GET /environments`) |
| `infisical.secret.value.read` | `read` | Revealing secret values (`GET /secrets/:secretId`). Without it, values are redacted from listings |
| `infisical.secret.create` | `create` | Creating secrets (`POST /secrets`) |
| `infisical.secret.update` | `update` | Updating secrets (`PATCH /secrets/:secretId`) |
| `infisical.secret.delete` | `delete` | Deleting secrets (`DELETE /secrets/:secretId`) |

The backend also enforces the entity annotations server-side, independently of the policy:

- The Infisical project is always taken from `infisical/projectId`; requests cannot pick another project.
- When `infisical/environment` is set, requests for any other environment are rejected with `403`.
- When `infisical/secretPath` is set without the `+` prefix, only that exact path is accessible. With the `+` prefix, that path and its subfolders are accessible. Path traversal attempts are rejected with `400`.
- Requests for an entity that does not exist or has no `infisical/projectId` annotation return `404`.
- Requests for an entity whose `infisical/identity` annotations name an identity that is not configured return `404`; identities with `allowedEntityRefs` reject other entities with `403`. These checks run after the permission check.

Make sure the permission framework is enabled in `app-config.yaml`:

```yaml
permission:
  enabled: true
```

### Using the RBAC plugin

If you manage permissions with the [community RBAC plugin](https://github.com/backstage/community-plugins/tree/main/workspaces/rbac) instead of a code policy, add `infisical-backend` to `permission.rbac.pluginsWithPermission` so the five permissions show up in the role editor:

```yaml
permission:
  enabled: true
  rbac:
    pluginsWithPermission:
      - catalog
      - infisical-backend
```

**Grant catalog access by permission name, not by resource type.** RBAC treats a resource-type grant as covering every permission that shares that resource type and action. Because the Infisical permissions use the `catalog-entity` resource type, a role holding `catalog-entity, read, allow` is also allowed `infisical.secret.read` and `infisical.secret.value.read`, which lets its members reveal secret values without ever being granted that permission. Use the named catalog permission instead and grant the Infisical permissions explicitly:

```csv
p, role:default/everyone, catalog.entity.read, read, allow
p, role:default/everyone, infisical.secret.read, read, allow
p, role:default/secret-editors, infisical.secret.value.read, read, allow
p, role:default/secret-editors, infisical.secret.create, create, allow
p, role:default/secret-editors, infisical.secret.update, update, allow
p, role:default/secret-editors, infisical.secret.delete, delete, allow
```

Note that the built-in RBAC admin role holds `catalog-entity, read`, so RBAC administrators can always reveal values.

### Example policy

The policy below lets every signed-in user list secrets, but restricts creating, updating, deleting and revealing values to the owners of the entity. It uses `createCatalogConditionalDecision` and `catalogConditions.isEntityOwner` from the catalog backend, so the catalog resolves the condition.

```typescript
// packages/backend/src/plugins/infisicalPermissionPolicy.ts
import { createBackendModule } from '@backstage/backend-plugin-api';
import {
  AuthorizeResult,
  isPermission,
  PolicyDecision,
} from '@backstage/plugin-permission-common';
import {
  PermissionPolicy,
  PolicyQuery,
  PolicyQueryUser,
} from '@backstage/plugin-permission-node';
import { policyExtensionPoint } from '@backstage/plugin-permission-node/alpha';
import {
  catalogConditions,
  createCatalogConditionalDecision,
} from '@backstage/plugin-catalog-backend/alpha';
import {
  infisicalSecretCreatePermission,
  infisicalSecretDeletePermission,
  infisicalSecretReadPermission,
  infisicalSecretUpdatePermission,
  infisicalSecretValueReadPermission,
} from '@infisical/backstage-plugin-infisical-common';

const ownerOnlyPermissions = [
  infisicalSecretCreatePermission,
  infisicalSecretUpdatePermission,
  infisicalSecretDeletePermission,
  infisicalSecretValueReadPermission,
];

class InfisicalPermissionPolicy implements PermissionPolicy {
  async handle(
    request: PolicyQuery,
    user?: PolicyQueryUser,
  ): Promise<PolicyDecision> {
    // Everyone can list secrets, folders and environments
    if (isPermission(request.permission, infisicalSecretReadPermission)) {
      return { result: AuthorizeResult.ALLOW };
    }

    // Only entity owners can create, update, delete and reveal values
    const ownerOnly = ownerOnlyPermissions.find(permission =>
      isPermission(request.permission, permission),
    );
    if (ownerOnly) {
      return createCatalogConditionalDecision(
        ownerOnly,
        catalogConditions.isEntityOwner({
          claims: user?.info.ownershipEntityRefs ?? [],
        }),
      );
    }

    // Everything else (catalog, scaffolder, ...) is allowed
    return { result: AuthorizeResult.ALLOW };
  }
}

export const infisicalPermissionPolicyModule = createBackendModule({
  pluginId: 'permission',
  moduleId: 'infisical-policy',
  register(reg) {
    reg.registerInit({
      deps: { policy: policyExtensionPoint },
      async init({ policy }) {
        policy.setPolicy(new InfisicalPermissionPolicy());
      },
    });
  },
});
```

Register it in `packages/backend/src/index.ts` instead of the allow-all policy module:

```typescript
backend.add(import('@backstage/plugin-permission-backend'));
backend.add(import('./plugins/infisicalPermissionPolicy'));
```

## Usage

Once installed and configured, you can:

1. View and manage secrets from Infisical directly in your Backstage instance
2. Create, update, and delete secrets from the Infisical tab in entity pages
3. Navigate between different environments and folders
4. Search and filter secrets based on key, value, or comments

## Development

### Getting Started

1. Clone the repository
2. Install dependencies:
```bash
yarn install
```

### Backend Development

To start the backend plugin in development mode:

```bash
# From the backend plugin directory
yarn start
```

This starts the backend in standalone mode on http://localhost:7007.

### Frontend Development

To run the frontend plugin in isolation:

```bash
# From the frontend plugin directory
yarn start
```

### Running Tests

```bash
yarn test
```
