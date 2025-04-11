import { createBackend } from '@backstage/backend-defaults';
import { mockServices } from '@backstage/backend-test-utils';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';
import { infisicalPlugin } from '../src';

// Create the backend instance
const backend = createBackend();

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
backend.add(infisicalPlugin);

// Start the backend
backend.start();
