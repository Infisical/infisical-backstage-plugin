# Backstage Infisical Plugin

![Backstage Loves Infisical](https://img.shields.io/badge/Backstage-loves%20Infisical-blue)
![License](https://img.shields.io/github/license/your-username/backstage-plugin-infisical)

A comprehensive Backstage plugin suite that integrates with [Infisical](https://infisical.com) for secrets management. This project consists of both frontend and backend plugins to help you manage secrets directly in your Backstage instance.

## Features

- **View & Manage Secrets**: Browse, create, update, and delete secrets stored in Infisical
- **Folder Navigation**: Browse through the folder structure of your Infisical projects
- **Environment Support**: Manage secrets across different environments (Development, Staging, Production)
- **Entity Integration**: Connect Backstage entities to Infisical projects

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
