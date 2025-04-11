import { createBackend } from '@backstage/backend-defaults';
import { mockServices } from '@backstage/backend-test-utils';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';
import { LoggerService } from '@backstage/backend-plugin-api';
import { ConfigReader } from '@backstage/config';

/**
 * Development setup for the infisical plugin.
 *
 * This sets up a minimal backend with mock services for development purposes.
 * Run this with `yarn start` to test the plugin independently.
 */

// Create a mock config with Infisical settings for development
const mockConfig = new ConfigReader({
  infisical: {
    baseUrl: 'https://app.infisical.com',
    // For development, you can set either API token or client credentials
    authentication: {
      // Comment out one of these authentication methods
      token: 'mock-api-token',
      // clientId: 'mock-client-id',
      // clientSecret: 'mock-client-secret',
    },
  },
});

// Create the backend instance
const backend = createBackend({
  // Override the config service with our mock config
  services: [
    {
      service: 'config',
      factory: () => ({
        get(): ConfigReader {
          return mockConfig;
        },
      }),
    },
    {
      service: 'logger',
      factory: () => ({
        child: (fields: Record<string, unknown>): LoggerService =>
          mockServices.logger.mock.factory().child(fields),
        ...mockServices.logger.mock.factory(),
      }),
    },
  ],
});

// Add mock services for development
backend.add(mockServices.auth.factory());
backend.add(mockServices.httpAuth.factory());

// Add a mock catalog with sample entities
backend.add(
  catalogServiceMock.factory({
    entities: [
      {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'sample',
          title: 'Sample Component',
        },
        spec: {
          type: 'service',
        },
      },
    ],
  }),
);

// Add our infisical plugin
backend.add(import('../src'));

// Start the backend
backend.start();
