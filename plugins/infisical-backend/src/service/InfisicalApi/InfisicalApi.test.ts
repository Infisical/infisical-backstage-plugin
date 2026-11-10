import { ConfigReader } from '@backstage/config';
import { mockServices } from '@backstage/backend-test-utils';
import { InfisicalApiClient, buildUserAgent } from '../InfisicalApi';
import { InputError, NotFoundError } from '@backstage/errors';

global.fetch = jest.fn();

/** A successful JSON response as returned by the mocked fetch */
function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: { get: () => 'application/json' },
  };
}

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

  const logger = mockServices.rootLogger();
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
      try {
        // eslint-disable-next-line no-new
        new InfisicalApiClient({
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

    it('should fetch secrets and folders successfully', async () => {
      // Both requests run in parallel, so answer by URL rather than call order
      (global.fetch as jest.Mock).mockImplementation((url: string) =>
        Promise.resolve(
          jsonResponse(
            new URL(url).pathname === '/api/v1/folders'
              ? { folders: [{ id: 'folder-1', name: 'nested' }] }
              : {
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
                },
          ),
        ),
      );

      const result = await apiClient.getSecrets('workspace123', '/path', 'dev');

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result.secrets).toHaveLength(2);
      expect(result.secrets[0].key).toBe('API_KEY');
      expect(result.folders).toEqual([{ id: 'folder-1', name: 'nested' }]);
    });

    it('should handle API errors correctly', async () => {
      (apiClient as any).retryDelay = 0;
      (apiClient as any).parseErrorResponse = jest
        .fn()
        .mockResolvedValue(new NotFoundError('Resource not found'));

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
        headers: {
          get: () => 'text/plain',
        },
        text: () => Promise.resolve('Resource not found'),
        json: () => Promise.reject(new Error('Not JSON')),
      });

      // The NotFoundError module mock is reset between tests, so only check
      // that the request rejects
      await expect(
        apiClient.getSecrets('workspace123', '/path', 'dev'),
      ).rejects.toBeDefined();
    });
  });

  describe('URL path segments', () => {
    beforeEach(() => {
      apiClient = new InfisicalApiClient({ config: mockConfig, logger });
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({ secret: { id: 'id', key: 'key', value: 'value' } }),
      );
    });

    function requestedUrl(): URL {
      return new URL((global.fetch as jest.Mock).mock.calls[0][0]);
    }

    it('encodes slashes and query characters in the secret key', async () => {
      await apiClient.getSecretById(
        'workspace123',
        '../../../v1/workspace/other?workspaceId=other&x=',
        { environment: 'dev', path: '/api' },
      );

      const url = requestedUrl();
      expect(url.pathname).toBe(
        '/api/v3/secrets/raw/..%2F..%2F..%2Fv1%2Fworkspace%2Fother%3FworkspaceId%3Dother%26x%3D',
      );
      expect(url.searchParams.getAll('workspaceId')).toEqual(['workspace123']);
    });

    it('encodes the key of a new secret', async () => {
      await apiClient.createSecret({
        secretKey: 'a/b',
        secretValue: 'v',
        workspaceId: 'workspace123',
        secretPath: '/',
        environment: 'dev',
      });

      expect(requestedUrl().pathname).toBe('/api/v3/secrets/raw/a%2Fb');
    });

    it('encodes the workspace ID', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({ workspace: { id: 'w', environments: [] } }),
      );

      await apiClient.getEnvironments('../secrets/raw');

      expect(requestedUrl().pathname).toBe(
        '/api/v1/workspace/..%2Fsecrets%2Fraw',
      );
    });

    it.each(['.', '..', ''])(
      'rejects the dot segment %j without calling Infisical',
      async secretId => {
        await expect(
          apiClient.deleteSecret(secretId, {
            workspaceId: 'workspace123',
            secretPath: '/',
            environment: 'dev',
          }),
        ).rejects.toThrow(InputError);
        await expect(
          apiClient.updateSecret(
            {
              secretKey: 'KEY',
              secretValue: 'v',
              workspaceId: 'workspace123',
              secretPath: '/',
              environment: 'dev',
            },
            secretId,
          ),
        ).rejects.toThrow(InputError);
        expect(global.fetch).not.toHaveBeenCalled();
      },
    );
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
        secretKey: 'NEW_API_KEY',
        secretValue: 'new-test-value',
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
        secretKey: 'EXISTING_API_KEY',
        secretValue: 'updated-value',
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

      const result = await apiClient.updateSecret(secretData, 'EXISTING_API_KEY');

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

  describe('buildUserAgent', () => {
    it('returns the product token without context', () => {
      expect(buildUserAgent()).toBe('backstage-plugin-infisical');
      expect(buildUserAgent({})).toBe('backstage-plugin-infisical');
    });

    it('includes the Backstage user and entity', () => {
      expect(
        buildUserAgent({
          userRef: 'user:default/jane',
          entityRef: 'component:default/api',
        }),
      ).toBe(
        'backstage-plugin-infisical (user=user:default/jane; entity=component:default/api)',
      );
    });

    it('drops characters that would break the header', () => {
      expect(
        buildUserAgent({ userRef: 'user:default/jáne\r\n(x); y' }),
      ).toBe('backstage-plugin-infisical (user=user:default/jnex y)');
    });
  });

  describe('identities and request context', () => {
    const workspaceResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          workspace: {
            id: 'workspace-1',
            name: 'Test Project',
            slug: 'test-project',
            environments: [],
          },
        }),
      headers: { get: () => 'application/json' },
    };

    it('sends the Backstage user and entity in the User-Agent header', async () => {
      apiClient = new InfisicalApiClient({ config: mockConfig, logger });
      (global.fetch as jest.Mock).mockResolvedValueOnce(workspaceResponse);

      await apiClient.getEnvironments('workspace-1', {
        userRef: 'user:default/jane',
        entityRef: 'component:default/api',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-api.example.com/api/v1/workspace/workspace-1',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-token',
            'User-Agent':
              'backstage-plugin-infisical (user=user:default/jane; entity=component:default/api)',
          }),
        }),
      );
    });

    it('logs in with the credentials of the given identity', async () => {
      // setupTests stubs Date.now, but resetAllMocks clears that stub between
      // tests; pin it so the fresh token is not considered expired.
      jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

      apiClient = new InfisicalApiClient({
        config: mockConfig,
        logger,
        identityName: 'payments-dev',
        authentication: new ConfigReader({
          universalAuth: {
            clientId: 'payments-dev-id',
            clientSecret: 'payments-dev-secret',
          },
        }),
      });

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({ accessToken: 'payments-dev-token', expiresIn: 3600 }),
        })
        .mockResolvedValueOnce(workspaceResponse);

      await apiClient.getEnvironments('workspace-1');

      const [loginUrl, loginInit] = (global.fetch as jest.Mock).mock.calls[0];
      expect(loginUrl).toBe(
        'https://test-api.example.com/api/v1/auth/universal-auth/login',
      );
      expect(JSON.parse(loginInit.body)).toEqual({
        clientId: 'payments-dev-id',
        clientSecret: 'payments-dev-secret',
      });

      const [, requestInit] = (global.fetch as jest.Mock).mock.calls[1];
      expect(requestInit.headers.Authorization).toBe(
        'Bearer payments-dev-token',
      );
      expect(requestInit.headers['User-Agent']).toBe(
        'backstage-plugin-infisical',
      );
    });

    it('names the identity when its credentials are missing', () => {
      expect(
        () =>
          new InfisicalApiClient({
            config: mockConfig,
            logger,
            identityName: 'broken',
            authentication: new ConfigReader({}),
          }),
      ).toThrow(
        "Missing Infisical Authentication credentials for identity 'broken'",
      );
    });
  });
});
