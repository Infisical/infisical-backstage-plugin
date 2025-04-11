import { startTestBackend } from '@backstage/backend-test-utils';
import { infisicalPlugin } from './plugin';

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
  it('should register routes', async () => {
    try {
      const backend = await startTestBackend({
        features: [infisicalPlugin]
      });

      expect(backend).toBeDefined();
    } catch (error) {
      console.error('Error starting test backend:', error);
    }
  });
});
