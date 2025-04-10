# Backstage Infisical Backend Plugin

![Backstage + Infisical](https://img.shields.io/badge/backstage-infisical-blue)

This plugin provides integration between [Backstage](https://backstage.io) and [Infisical](https://infisical.com), a secrets management platform. It allows you to manage, access, and modify secrets stored in Infisical directly through your Backstage instance.

## Features

- Fetch secrets from Infisical workspaces
- Create, update, and delete secrets
- List environments for workspaces
- Support for both API token and client credentials authentication methods

## Installation

This plugin is published as `@backstage/plugin-infisical-backend`. To install it in your Backstage backend, run:

```bash
# From your Backstage root directory
yarn --cwd packages/backend add @backstage/plugin-infisical-backend
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
      apiToken: ${INFISICAL_API_TOKEN}
    
    # Option 2: Client Credentials Authentication
    universalAuth:
      clientId: ${INFISICAL_CLIENT_ID}
      clientSecret: ${INFISICAL_CLIENT_SECRET}
```

## Usage

Add the plugin to your backend in `packages/backend/src/index.ts`:

```typescript
import { createBackend } from '@backstage/backend-defaults';

const backend = createBackend();

// ... other plugins
backend.add(import('@backstage/plugin-infisical-backend'));

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