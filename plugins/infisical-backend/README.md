# Backstage Infisical Backend Plugin

![Backstage + Infisical](https://img.shields.io/badge/backstage-infisical-blue)

This plugin provides integration between [Backstage](https://backstage.io) and [Infisical](https://infisical.com), a secrets management platform. It allows you to manage, access, and modify secrets stored in Infisical directly through your Backstage instance.

## Features

- Fetch secrets of the Infisical project linked to a catalog entity
- Create, update, and delete secrets
- List environments of the linked project
- Enforces the `infisical/projectId`, `infisical/environment` and `infisical/secretPath` entity annotations server-side
- Integrates with the Backstage permission framework
- Support for both API token and client credentials authentication methods
- Multiple named machine identities, selected per entity and per environment with the `infisical/identity` annotations
- Sends the Backstage user and entity in the `User-Agent` header so they show up in Infisical's audit log

## API

Every route is scoped to a catalog entity through the `entityRef` parameter (for example `component:default/my-service`). The Infisical project, environment and path are derived from the entity's annotations; the request may only narrow them within what the annotations allow.

| Route | Parameters | Permission |
|---|---|---|
| `GET /secrets` | query: `entityRef`, `path?`, `environment?` | `infisical.secret.read` (values redacted unless `infisical.secret.value.read`) |
| `GET /secrets/:secretId` | query: `entityRef`, `path?`, `environment?` | `infisical.secret.value.read` |
| `GET /environments` | query: `entityRef` | `infisical.secret.read` |
| `POST /secrets` | body: `entityRef`, `secretKey`, `secretValue`, `secretComment?`, `secretPath?`, `environment?` | `infisical.secret.create` |
| `PATCH /secrets/:secretId` | body: same as `POST /secrets`, except `secretValue?` is optional (omit it to keep the current value) | `infisical.secret.update` |
| `DELETE /secrets/:secretId` | body: `entityRef`, `environment?`, `secretPath?` | `infisical.secret.delete` |

Responses: `400` for invalid input or path traversal attempts, `403` when the permission is denied, the environment/path is outside what the annotations allow, or the entity is not in the selected identity's `allowedEntityRefs`, `404` when the entity does not exist, has no `infisical/projectId` annotation, or references an identity that is not configured.

See the repository README for the list of permissions and an example policy.

## Installation

This plugin is published as `@infisical/backstage-backend-plugin-infisical`. To install it in your Backstage backend, run:

```bash
# From your Backstage root directory
yarn --cwd packages/backend add @infisical/backstage-backend-plugin-infisical
```

## Configuration

Add the following to your `app-config.yaml` to configure the plugin:

```yaml
infisical:
  baseUrl: https://app.infisical.com  # Optional, defaults to https://app.infisical.com
  
  # You must configure one of the following authentication methods:
  authentication:
    auth_token:
      # Option 1: API Token Authentication
      token: ${INFISICAL_API_TOKEN}
    
    # Option 2: Client Credentials Authentication
    universalAuth:
      clientId: ${INFISICAL_CLIENT_ID}
      clientSecret: ${INFISICAL_CLIENT_SECRET}
```

### Multiple machine identities

Named identities let entities act as different machine identities, so the Infisical audit log shows which entity or environment each change came from. `authentication` stays the default for entities without an `infisical/identity` annotation and becomes optional once `identities` is set.

```yaml
infisical:
  identities:
    payments-dev:
      universalAuth:
        clientId: ${INFISICAL_PAYMENTS_DEV_CLIENT_ID}
        clientSecret: ${INFISICAL_PAYMENTS_DEV_CLIENT_SECRET}
    payments-prod:
      universalAuth:
        clientId: ${INFISICAL_PAYMENTS_PROD_CLIENT_ID}
        clientSecret: ${INFISICAL_PAYMENTS_PROD_CLIENT_SECRET}
      allowedEntityRefs: # optional allowlist
        - component:default/payments-service
```

Entities select them with annotations:

```yaml
infisical/identity: payments-dev        # default for the entity
infisical/identity.prod: payments-prod  # override for the prod environment
```

Every request also sends `User-Agent: backstage-plugin-infisical (user=<user ref>; entity=<entity ref>)`, which Infisical records in its audit log. See the repository README for details.

## Usage

Add the plugin to your backend in `packages/backend/src/index.ts`:

```typescript
import { createBackend } from '@backstage/backend-defaults';

const backend = createBackend();

// ... other plugins
backend.add(import('@infisical/backstage-backend-plugin-infisical'));

backend.start();
```

## Development

To start the plugin in development mode:

```bash
# From the plugin directory
yarn start
```

This starts the backend in standalone mode on http://localhost:7007.

### Running Tests

```bash
yarn test
```