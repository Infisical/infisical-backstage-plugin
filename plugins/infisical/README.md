# Backstage Infisical Plugin

![Backstage Loves Infisical](https://img.shields.io/badge/Backstage-loves%20Infisical-blue)
![License](https://img.shields.io/github/license/your-username/backstage-plugin-infisical)

A plugin for [Backstage](https://backstage.io) that integrates with [Infisical](https://infisical.com) for secrets management. This plugin allows you to:

- View, create, edit, and delete secrets in your Infisical projects
- Navigate secrets across different folders and environments
- Display secrets in a user-friendly table with access controls

## Installation

### For your Backstage app

```bash
# From your Backstage root directory
yarn add --cwd packages/app @infisical/backstage-plugin-infisical
```

### Backend plugin
This frontend plugin requires the corresponding backend plugin to be installed. Please follow the instructions in the [backend plugin repository](https://github.com/your-username/backstage-plugin-infisical-backend).

## Configuration

### App Configuration

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
```

Replace `<your-infisical-project-id>` with the ID of your Infisical project.

## Features

### Secret Management

- **View Secrets**: Browse secrets in a table with support for hiding sensitive values
- **Create Secrets**: Add new secrets with key, value, and optional comments
- **Update Secrets**: Modify existing secret values and metadata
- **Delete Secrets**: Remove secrets that are no longer needed

### Folder Navigation

- **Folder Browsing**: Navigate the folder structure of your Infisical project
- **Breadcrumb Navigation**: Easily navigate up and down the folder hierarchy

### Environment Support

- **Environment Selection**: View and manage secrets across different environments (Development, Staging, Production, etc.)
- **Environment-specific Secrets**: Each environment has its own set of secrets

### Search and Filtering

- **Instant Filtering**: Quickly find secrets by filtering the table by key, value, or comment

## Development

### Getting Started

1. Clone the repository
2. Install dependencies:
```bash
yarn install
```
3. Run the plugin in isolation:
```bash
yarn start
```

### Running Tests

Run all tests:
```bash
yarn test
```

Run tests with coverage:
```bash
yarn test:coverage
```

### Building

```bash
yarn build
```
