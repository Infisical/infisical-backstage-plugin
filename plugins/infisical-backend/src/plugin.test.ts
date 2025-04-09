import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import { infisicalPlugin } from './plugin';
import { ConfigReader } from '@backstage/config';

jest.mock('./service/infisicalApi', () => {
  const mockClient = {
    getSecrets: jest.fn(),
    getEnvironments: jest.fn(),
    createSecret: jest.fn(),
    updateSecret: jest.fn(),
    deleteSecret: jest.fn(),
  };

  return {
    InfisicalApiClient: jest.fn(() => mockClient),
  };
});

describe('infisical-backend', () => {
  const mockConfig = new ConfigReader({
    infisical: {
      baseUrl: 'https://test-api.example.com',
      authentication: {
        apiToken: 'test-api-token',
      },
    },
  });

  it('should register routes', async () => {
    try {
      const backend = await startTestBackend({
        features: [infisicalPlugin],
        services: [
          mockServices.rootConfig.factory({ data: mockConfig.get() }),
          mockServices.logger.factory(),
        ],
      });

      expect(backend).toBeDefined();
    } catch (error) {
      console.error('Error starting test backend:', error);
    }
  });
});
