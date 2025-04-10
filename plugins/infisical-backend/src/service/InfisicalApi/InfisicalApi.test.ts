import { ConfigReader } from '@backstage/config';
import { getVoidLogger } from '@backstage/backend-common';
import { InfisicalApiClient } from '../infisicalApi';
import { NotFoundError } from '@backstage/errors';

global.fetch = jest.fn();

jest.mock('@backstage/errors', () => {
  const actual = jest.requireActual('@backstage/errors');
  return {
    ...actual,
    NotFoundError: jest.fn().mockImplementation(message => {
      const error = new Error(message);
      error.name = 'NotFoundError';
      return error;
    }),
  };
});

describe('InfisicalApiClient', () => {
  const mockConfig = new ConfigReader({
    infisical: {
      baseUrl: 'https://test-api.example.com',
      authentication: {
        auth_token: {
          token: 'test-api-token',
        },
      },
    },
  });

  const mockClientCredentialsConfig = new ConfigReader({
    infisical: {
      baseUrl: 'https://test-api.example.com',
      authentication: {
        universalAuth: {
            clientId: 'test-client-id',
            clientSecret: 'test-client-secret',
        }
      },
    },
  });

  const logger = getVoidLogger();
  let apiClient: InfisicalApiClient;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with API token authentication', () => {
      apiClient = new InfisicalApiClient({ config: mockConfig, logger });
      expect(apiClient).toBeDefined();
    });

    it('should initialize with client credentials authentication', () => {
      apiClient = new InfisicalApiClient({
        config: mockClientCredentialsConfig,
        logger,
      });
      expect(apiClient).toBeDefined();
    });

    it('should throw error if no authentication is provided', () => {
      const invalidConfig = new ConfigReader({
        infisical: {
          baseUrl: 'https://test-api.example.com',
        },
      });
      let error: Error | null = null;
      let apiClientFail: InfisicalApiClient | null = null;
      try {
        apiClientFail = new InfisicalApiClient({
          config: invalidConfig,
          logger,
        });
      } catch (err) {
        error = err as Error;
      }

      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toContain(
        'Missing Infisical Authentication credentials',
      );
    });
  });

  describe('getSecrets', () => {
    beforeEach(() => {
      apiClient = new InfisicalApiClient({ config: mockConfig, logger });
    });

    it('should fetch secrets successfully', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              secrets: [
                { id: 'mock-secret-1', key: 'API_KEY', value: 'mock-value-1' },
                {
                  id: 'mock-secret-2',
                  key: 'DATABASE_URL',
                  value: 'mock-value-2',
                },
              ],
            }),
          text: () =>
            Promise.resolve(
              JSON.stringify({
                secrets: [
                  {
                    id: 'mock-secret-1',
                    key: 'API_KEY',
                    value: 'mock-value-1',
                  },
                  {
                    id: 'mock-secret-2',
                    key: 'DATABASE_URL',
                    value: 'mock-value-2',
                  },
                ],
              }),
            ),
          headers: {
            get: () => 'application/json',
          },
        }),
      );

      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              folders: [],
            }),
          text: () =>
            Promise.resolve(
              JSON.stringify({
                folders: [],
              }),
            ),
          headers: {
            get: () => 'application/json',
          },
        }),
      );

      const result = await apiClient.getSecrets('workspace123', '/path', 'dev');

      expect(result).toBeDefined();
      expect(result.secrets).toHaveLength(2);
      expect(result.secrets[0].key).toBe('API_KEY');
    });

    it('should handle API errors correctly', async () => {
      (apiClient as any).parseErrorResponse = jest
        .fn()
        .mockResolvedValue(new NotFoundError('Resource not found'));

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: {
          get: () => 'text/plain',
        },
        text: () => Promise.resolve('Resource not found'),
        json: () => Promise.reject(new Error('Not JSON')),
      });

      let error: Error | null = null;
      try {
        await apiClient.getSecrets('workspace123', '/path', 'dev');
      } catch (err) {
        error = err as Error;
      }

      expect(error).toBeDefined();
    });
  });

  describe('client credentials authentication', () => {
    beforeEach(() => {
      apiClient = new InfisicalApiClient({
        config: mockClientCredentialsConfig,
        logger,
      });

      (apiClient as any).authenticateWithClientCredentials = jest
        .fn()
        .mockResolvedValue(undefined);
    });

    it('should authenticate and get a token', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              workspace: {
                id: 'workspace-1',
                name: 'Test Project',
                slug: 'test-project',
                environments: [
                  { id: 'env-1', name: 'Development', slug: 'dev' },
                  { id: 'env-2', name: 'Production', slug: 'prod' },
                ],
              },
            }),
          text: () =>
            Promise.resolve(
              JSON.stringify({
                workspace: {
                  id: 'workspace-1',
                  name: 'Test Project',
                  slug: 'test-project',
                  environments: [
                    { id: 'env-1', name: 'Development', slug: 'dev' },
                    { id: 'env-2', name: 'Production', slug: 'prod' },
                  ],
                },
              }),
            ),
          headers: {
            get: () => 'application/json',
          },
        }),
      );

      (apiClient as any).credentials = {
        type: 'client-credentials',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        accessToken: 'mock-access-token',
        tokenExpiresAt: Date.now() + 3600000,
      };

      const result = await apiClient.getEnvironments('workspace123');

      expect(result).toBeDefined();
      expect(result.environments).toHaveLength(2);
      expect(
        (apiClient as any).authenticateWithClientCredentials,
      ).toHaveBeenCalled();
    });
  });

  describe('CRUD operations', () => {
    beforeEach(() => {
      apiClient = new InfisicalApiClient({ config: mockConfig, logger });
    });

    it('should create a secret', async () => {
      const secretData = {
        key: 'NEW_API_KEY',
        value: 'new-test-value',
        workspaceId: 'workspace123',
        secretPath: '/api',
        environment: 'dev',
      };

      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 201,
          json: () =>
            Promise.resolve({
              secret: {
                id: 'new-secret-id',
                key: 'NEW_API_KEY',
                value: 'new-test-value',
              },
            }),
          text: () =>
            Promise.resolve(
              JSON.stringify({
                secret: {
                  id: 'new-secret-id',
                  key: 'NEW_API_KEY',
                  value: 'new-test-value',
                },
              }),
            ),
          headers: {
            get: () => 'application/json',
          },
        }),
      );

      const result = await apiClient.createSecret(secretData);

      expect(result).toBeDefined();
      expect(result.id).toBe('new-secret-id');
      expect(result.key).toBe('NEW_API_KEY');
    });

    it('should update a secret', async () => {
      const secretData = {
        key: 'EXISTING_API_KEY',
        value: 'updated-value',
        workspaceId: 'workspace123',
        secretPath: '/api',
        environment: 'dev',
      };

      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              secret: {
                id: 'updated-secret-id',
                key: 'EXISTING_API_KEY',
                value: 'updated-value',
              },
            }),
          text: () =>
            Promise.resolve(
              JSON.stringify({
                secret: {
                  id: 'updated-secret-id',
                  key: 'EXISTING_API_KEY',
                  value: 'updated-value',
                },
              }),
            ),
          headers: {
            get: () => 'application/json',
          },
        }),
      );

      const result = await apiClient.updateSecret(secretData);

      expect(result).toBeDefined();
      expect(result.id).toBe('updated-secret-id');
      expect(result.value).toBe('updated-value');
    });

    it('should delete a secret', async () => {
      const secretData = {
        workspaceId: 'workspace123',
        secretPath: '/api',
        environment: 'dev',
      };

      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 204,
          text: () => Promise.resolve(''),
          json: () => Promise.reject(new Error('No content')),
          headers: {
            get: () => 'text/plain',
          },
        }),
      );

      await expect(
        apiClient.deleteSecret('secret1', secretData),
      ).resolves.not.toThrow();
    });
  });
});
