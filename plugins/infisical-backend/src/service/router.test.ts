import express from 'express';
import request from 'supertest';
import { createRouter } from './router';
import { ConfigReader } from '@backstage/config';
import {
  mockCredentials,
  mockErrorHandler,
  mockServices,
} from '@backstage/backend-test-utils';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { CatalogService } from '@backstage/plugin-catalog-node';
import { Entity } from '@backstage/catalog-model';
import { NotFoundError, ConflictError } from '@backstage/errors';
import {
  infisicalSecretCreatePermission,
  infisicalSecretDeletePermission,
  infisicalSecretReadPermission,
  infisicalSecretUpdatePermission,
  infisicalSecretValueReadPermission,
} from '@infisical/backstage-plugin-infisical-common';
import { InfisicalSecret, InfisicalProject } from './types';
import { InfisicalApiClient } from './InfisicalApi';

function mockApi() {
  return {
    getSecrets: jest.fn(),
    getSecretById: jest.fn(),
    getEnvironments: jest.fn(),
    createSecret: jest.fn(),
    updateSecret: jest.fn(),
    deleteSecret: jest.fn(),
  };
}

/** Client of the default identity (`infisical.authentication`) */
const mockInfisicalApi = mockApi();

/** Clients of the named identities (`infisical.identities`) */
const mockIdentityApis: Record<string, ReturnType<typeof mockApi>> = {
  'payments-dev': mockApi(),
  'payments-prod': mockApi(),
  restricted: mockApi(),
};

/** Returns the mock client of the identity an InfisicalApiClient is built for */
function mockClientFor({ identityName }: { identityName?: string }) {
  return identityName ? mockIdentityApis[identityName] : mockInfisicalApi;
}

jest.mock('./InfisicalApi', () => {
  return {
    InfisicalApiClient: jest.fn().mockImplementation(mockClientFor),
  };
});

const ENTITY_REF = 'component:default/example';
const WORKSPACE_ID = 'workspace123';
/** Audit context sent to Infisical for the default mock user */
const CONTEXT = { userRef: 'user:default/mock', entityRef: ENTITY_REF };

const universalAuth = {
  universalAuth: { clientId: 'client-id', clientSecret: 'client-secret' },
};

function entityWith(annotations: Record<string, string> = {}): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'example',
      namespace: 'default',
      annotations: {
        'infisical/projectId': WORKSPACE_ID,
        ...annotations,
      },
    },
    spec: {},
  };
}

const mockProject: InfisicalProject = {
  id: WORKSPACE_ID,
  name: 'Test Project',
  slug: 'test-project',
  environments: [
    { id: 'env1', name: 'Development', slug: 'dev' },
    { id: 'env2', name: 'Staging', slug: 'staging' },
  ],
};

const mockSecrets = {
  secrets: [
    { id: 'secret1', key: 'API_KEY', value: 'test-value' },
    { id: 'secret2', key: 'OTHER', value: 'other-value' },
  ] as InfisicalSecret[],
  folders: [],
};

describe('infisical router', () => {
  let app: express.Express;
  const permissions = mockServices.permissions.mock();
  const getEntityByRef = jest.fn();

  /** Sets which permissions are allowed; all others are denied. */
  function allowOnly(...allowed: string[]) {
    permissions.authorize.mockImplementation(
      async (requests: { permission: { name: string } }[]) =>
        requests.map(({ permission }) => ({
          result: allowed.includes(permission.name)
            ? AuthorizeResult.ALLOW
            : AuthorizeResult.DENY,
        })),
    );
  }

  function allowAll() {
    permissions.authorize.mockImplementation(async (requests: unknown[]) =>
      requests.map(() => ({ result: AuthorizeResult.ALLOW })),
    );
  }

  function denyAll() {
    allowOnly();
  }

  beforeAll(async () => {
    const router = await createRouter({
      logger: mockServices.rootLogger(),
      config: new ConfigReader({
        infisical: {
          authentication: universalAuth,
          identities: {
            'payments-dev': universalAuth,
            'payments-prod': universalAuth,
            restricted: {
              ...universalAuth,
              allowedEntityRefs: ['component:default/allowed'],
            },
          },
        },
      }),
      httpAuth: mockServices.httpAuth(),
      auth: mockServices.auth(),
      permissions,
      catalog: { getEntityByRef } as unknown as CatalogService,
    });

    app = express().use(router).use(mockErrorHandler());
  });

  beforeEach(() => {
    jest.clearAllMocks();
    getEntityByRef.mockResolvedValue(entityWith());
    allowAll();
    mockInfisicalApi.getSecrets.mockResolvedValue(mockSecrets);
    mockInfisicalApi.getSecretById.mockResolvedValue(mockSecrets.secrets[0]);
    mockInfisicalApi.getEnvironments.mockResolvedValue(mockProject);
    mockInfisicalApi.createSecret.mockResolvedValue(mockSecrets.secrets[0]);
    mockInfisicalApi.updateSecret.mockResolvedValue(mockSecrets.secrets[0]);
    mockInfisicalApi.deleteSecret.mockResolvedValue(undefined);
  });

  describe('entity resolution', () => {
    it('returns 400 when entityRef is missing', async () => {
      const response = await request(app).get('/secrets');

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('entityRef is required');
      expect(getEntityByRef).not.toHaveBeenCalled();
    });

    it('returns 400 when entityRef is malformed', async () => {
      const response = await request(app).get('/secrets?entityRef=not-a-ref');

      expect(response.status).toBe(400);
      expect(getEntityByRef).not.toHaveBeenCalled();
    });

    it('returns 404 when the entity does not exist', async () => {
      getEntityByRef.mockResolvedValue(undefined);

      const response = await request(app).get(
        `/secrets?entityRef=${ENTITY_REF}`,
      );

      expect(response.status).toBe(404);
      expect(mockInfisicalApi.getSecrets).not.toHaveBeenCalled();
    });

    it('returns 404 when the entity has no infisical/projectId annotation', async () => {
      getEntityByRef.mockResolvedValue({
        ...entityWith(),
        metadata: { name: 'example', namespace: 'default' },
      });

      const response = await request(app).get(
        `/secrets?entityRef=${ENTITY_REF}`,
      );

      expect(response.status).toBe(404);
      expect(mockInfisicalApi.getSecrets).not.toHaveBeenCalled();
    });

    it('looks up the entity with the caller credentials', async () => {
      await request(app).get(`/secrets?entityRef=${ENTITY_REF}`);

      expect(getEntityByRef).toHaveBeenCalledWith(ENTITY_REF, {
        credentials: mockCredentials.user(),
      });
    });
  });

  describe('GET /secrets', () => {
    it('returns secrets using the workspace from the entity annotation', async () => {
      const response = await request(app).get(
        `/secrets?entityRef=${ENTITY_REF}&path=/api&environment=dev`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockSecrets);
      expect(mockInfisicalApi.getSecrets).toHaveBeenCalledWith(
        WORKSPACE_ID,
        '/api',
        'dev',
        CONTEXT,
      );
    });

    it('authorizes read and value.read against the entity in one call', async () => {
      await request(app).get(`/secrets?entityRef=${ENTITY_REF}`);

      expect(permissions.authorize).toHaveBeenCalledTimes(1);
      expect(permissions.authorize).toHaveBeenCalledWith(
        [
          {
            permission: infisicalSecretReadPermission,
            resourceRef: ENTITY_REF,
          },
          {
            permission: infisicalSecretValueReadPermission,
            resourceRef: ENTITY_REF,
          },
        ],
        { credentials: mockCredentials.user() },
      );
    });

    it('returns 403 when read is denied', async () => {
      denyAll();

      const response = await request(app).get(
        `/secrets?entityRef=${ENTITY_REF}`,
      );

      expect(response.status).toBe(403);
      expect(mockInfisicalApi.getSecrets).not.toHaveBeenCalled();
    });

    it('redacts values when value.read is denied', async () => {
      allowOnly(infisicalSecretReadPermission.name);

      const response = await request(app).get(
        `/secrets?entityRef=${ENTITY_REF}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.secrets).toEqual([
        { id: 'secret1', key: 'API_KEY', value: '' },
        { id: 'secret2', key: 'OTHER', value: '' },
      ]);
    });

    it('passes no path for the root path', async () => {
      await request(app).get(`/secrets?entityRef=${ENTITY_REF}&path=/`);

      expect(mockInfisicalApi.getSecrets).toHaveBeenCalledWith(
        WORKSPACE_ID,
        undefined,
        undefined,
        CONTEXT,
      );
    });

    it('handles API errors correctly', async () => {
      mockInfisicalApi.getSecrets.mockRejectedValueOnce(
        new NotFoundError('Workspace not found'),
      );

      const response = await request(app).get(
        `/secrets?entityRef=${ENTITY_REF}`,
      );

      expect(response.status).toBe(404);
      expect(response.body.error.message).toContain('Workspace not found');
    });
  });

  describe('environment lock', () => {
    beforeEach(() => {
      getEntityByRef.mockResolvedValue(
        entityWith({ 'infisical/environment': 'staging' }),
      );
    });

    it('rejects a different environment', async () => {
      const response = await request(app).get(
        `/secrets?entityRef=${ENTITY_REF}&environment=production`,
      );

      expect(response.status).toBe(403);
      expect(mockInfisicalApi.getSecrets).not.toHaveBeenCalled();
    });

    it('uses the locked environment when none is requested', async () => {
      const response = await request(app).get(
        `/secrets?entityRef=${ENTITY_REF}`,
      );

      expect(response.status).toBe(200);
      expect(mockInfisicalApi.getSecrets).toHaveBeenCalledWith(
        WORKSPACE_ID,
        undefined,
        'staging',
        CONTEXT,
      );
    });

    it('allows the locked environment', async () => {
      const response = await request(app).get(
        `/secrets?entityRef=${ENTITY_REF}&environment=staging`,
      );

      expect(response.status).toBe(200);
    });

    it('only returns the locked environment from GET /environments', async () => {
      const response = await request(app).get(
        `/environments?entityRef=${ENTITY_REF}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.environments).toEqual([
        { id: 'env2', name: 'Staging', slug: 'staging' },
      ]);
    });

    it('applies to mutations', async () => {
      const response = await request(app).post('/secrets').send({
        entityRef: ENTITY_REF,
        secretKey: 'KEY',
        secretValue: 'value',
        environment: 'production',
      });

      expect(response.status).toBe(403);
      expect(mockInfisicalApi.createSecret).not.toHaveBeenCalled();
    });
  });

  describe('path restriction without "+"', () => {
    beforeEach(() => {
      getEntityByRef.mockResolvedValue(
        entityWith({ 'infisical/secretPath': '/api' }),
      );
    });

    it('allows the exact path', async () => {
      const response = await request(app).get(
        `/secrets?entityRef=${ENTITY_REF}&path=/api`,
      );

      expect(response.status).toBe(200);
      expect(mockInfisicalApi.getSecrets).toHaveBeenCalledWith(
        WORKSPACE_ID,
        '/api',
        undefined,
        CONTEXT,
      );
    });

    it('defaults to the restricted path', async () => {
      await request(app).get(`/secrets?entityRef=${ENTITY_REF}`);

      expect(mockInfisicalApi.getSecrets).toHaveBeenCalledWith(
        WORKSPACE_ID,
        '/api',
        undefined,
        CONTEXT,
      );
    });

    it.each(['/api/sub', '/other', '/'])('rejects %s', async path => {
      const response = await request(app).get(
        `/secrets?entityRef=${ENTITY_REF}&path=${encodeURIComponent(path)}`,
      );

      expect(response.status).toBe(403);
      expect(mockInfisicalApi.getSecrets).not.toHaveBeenCalled();
    });

    it('applies to mutations', async () => {
      const response = await request(app).post('/secrets').send({
        entityRef: ENTITY_REF,
        secretKey: 'KEY',
        secretValue: 'value',
        secretPath: '/api/sub',
      });

      expect(response.status).toBe(403);
      expect(mockInfisicalApi.createSecret).not.toHaveBeenCalled();
    });
  });

  describe('path restriction with "+"', () => {
    beforeEach(() => {
      getEntityByRef.mockResolvedValue(
        entityWith({ 'infisical/secretPath': '+/api' }),
      );
    });

    it.each(['/api', '/api/sub', '/api/sub/deeper'])(
      'allows %s',
      async path => {
        const response = await request(app).get(
          `/secrets?entityRef=${ENTITY_REF}&path=${encodeURIComponent(path)}`,
        );

        expect(response.status).toBe(200);
        expect(mockInfisicalApi.getSecrets).toHaveBeenCalledWith(
          WORKSPACE_ID,
          path,
          undefined,
          CONTEXT,
        );
      },
    );

    it.each(['/other', '/apix', '/'])('rejects %s', async path => {
      const response = await request(app).get(
        `/secrets?entityRef=${ENTITY_REF}&path=${encodeURIComponent(path)}`,
      );

      expect(response.status).toBe(403);
      expect(mockInfisicalApi.getSecrets).not.toHaveBeenCalled();
    });

    it('rejects path traversal with 400', async () => {
      const response = await request(app).get(
        `/secrets?entityRef=${ENTITY_REF}&path=${encodeURIComponent(
          '/api/../other',
        )}`,
      );

      expect(response.status).toBe(400);
      expect(mockInfisicalApi.getSecrets).not.toHaveBeenCalled();
    });
  });

  describe('GET /secrets/:secretId', () => {
    it('returns the secret with its value when value.read is allowed', async () => {
      const response = await request(app).get(
        `/secrets/API_KEY?entityRef=${ENTITY_REF}&path=/api&environment=dev`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockSecrets.secrets[0]);
      expect(mockInfisicalApi.getSecretById).toHaveBeenCalledWith(
        WORKSPACE_ID,
        'API_KEY',
        { environment: 'dev', path: '/api' },
        CONTEXT,
      );
      expect(permissions.authorize).toHaveBeenCalledWith(
        [
          {
            permission: infisicalSecretValueReadPermission,
            resourceRef: ENTITY_REF,
          },
        ],
        { credentials: mockCredentials.user() },
      );
    });

    it('returns 403 when only read is allowed', async () => {
      allowOnly(infisicalSecretReadPermission.name);

      const response = await request(app).get(
        `/secrets/API_KEY?entityRef=${ENTITY_REF}`,
      );

      expect(response.status).toBe(403);
      expect(mockInfisicalApi.getSecretById).not.toHaveBeenCalled();
    });
  });

  describe('GET /environments', () => {
    it('returns environments when allowed', async () => {
      const response = await request(app).get(
        `/environments?entityRef=${ENTITY_REF}`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockProject);
      expect(mockInfisicalApi.getEnvironments).toHaveBeenCalledWith(
        WORKSPACE_ID,
        CONTEXT,
      );
      expect(permissions.authorize).toHaveBeenCalledWith(
        [
          {
            permission: infisicalSecretReadPermission,
            resourceRef: ENTITY_REF,
          },
        ],
        { credentials: mockCredentials.user() },
      );
    });

    it('returns 403 when denied', async () => {
      denyAll();

      const response = await request(app).get(
        `/environments?entityRef=${ENTITY_REF}`,
      );

      expect(response.status).toBe(403);
      expect(mockInfisicalApi.getEnvironments).not.toHaveBeenCalled();
    });

    it('returns 400 when entityRef is missing', async () => {
      const response = await request(app).get('/environments');

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('entityRef is required');
    });
  });

  describe('POST /secrets', () => {
    const secretData = {
      entityRef: ENTITY_REF,
      secretKey: 'API_KEY',
      secretValue: 'test-value',
      secretComment: 'a comment',
      secretPath: '/api',
      environment: 'dev',
    };

    it('creates a secret when allowed', async () => {
      const response = await request(app).post('/secrets').send(secretData);

      expect(response.status).toBe(201);
      expect(response.body).toEqual(mockSecrets.secrets[0]);
      expect(mockInfisicalApi.createSecret).toHaveBeenCalledWith(
        {
          secretKey: 'API_KEY',
          secretValue: 'test-value',
          secretComment: 'a comment',
          type: undefined,
          workspaceId: WORKSPACE_ID,
          secretPath: '/api',
          environment: 'dev',
        },
        CONTEXT,
      );
      expect(permissions.authorize).toHaveBeenCalledWith(
        [
          {
            permission: infisicalSecretCreatePermission,
            resourceRef: ENTITY_REF,
          },
        ],
        { credentials: mockCredentials.user() },
      );
    });

    it('returns 403 when create is denied', async () => {
      allowOnly(infisicalSecretReadPermission.name);

      const response = await request(app).post('/secrets').send(secretData);

      expect(response.status).toBe(403);
      expect(mockInfisicalApi.createSecret).not.toHaveBeenCalled();
    });

    it('returns 400 when required fields are missing', async () => {
      const response = await request(app).post('/secrets').send({
        entityRef: ENTITY_REF,
      });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain(
        'Key and value are required fields',
      );
    });

    it('returns 400 when entityRef is missing', async () => {
      const response = await request(app).post('/secrets').send({
        secretKey: 'API_KEY',
        secretValue: 'test-value',
      });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('entityRef is required');
    });

    it.each([{ slug: 'dev' }, ['dev'], 42])(
      'returns 400 when environment is %j instead of a string',
      async environment => {
        const response = await request(app)
          .post('/secrets')
          .send({ ...secretData, environment });

        expect(response.status).toBe(400);
        expect(response.body.error.message).toContain(
          'environment must be a string',
        );
        expect(getEntityByRef).not.toHaveBeenCalled();
        expect(mockInfisicalApi.createSecret).not.toHaveBeenCalled();
      },
    );

    it('handles conflict errors from the API', async () => {
      mockInfisicalApi.createSecret.mockRejectedValueOnce(
        new ConflictError('Secret with this key already exists'),
      );

      const response = await request(app).post('/secrets').send(secretData);

      expect(response.status).toBe(409);
      expect(response.body.error.message).toContain('already exists');
    });
  });

  describe('PATCH /secrets/:secretId', () => {
    const secretData = {
      entityRef: ENTITY_REF,
      secretKey: 'API_KEY',
      secretValue: 'updated-value',
      secretPath: '/api',
      environment: 'dev',
    };

    it('updates a secret when allowed', async () => {
      const response = await request(app)
        .patch('/secrets/secret1')
        .send(secretData);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockSecrets.secrets[0]);
      expect(mockInfisicalApi.updateSecret).toHaveBeenCalledWith(
        {
          secretKey: 'API_KEY',
          secretValue: 'updated-value',
          secretComment: undefined,
          type: undefined,
          workspaceId: WORKSPACE_ID,
          secretPath: '/api',
          environment: 'dev',
        },
        'secret1',
        CONTEXT,
      );
      expect(permissions.authorize).toHaveBeenCalledWith(
        [
          {
            permission: infisicalSecretUpdatePermission,
            resourceRef: ENTITY_REF,
          },
        ],
        { credentials: mockCredentials.user() },
      );
    });

    it('returns 403 when update is denied', async () => {
      allowOnly(infisicalSecretReadPermission.name);

      const response = await request(app)
        .patch('/secrets/secret1')
        .send(secretData);

      expect(response.status).toBe(403);
      expect(mockInfisicalApi.updateSecret).not.toHaveBeenCalled();
    });

    it('keeps the current value when secretValue is omitted', async () => {
      // e.g. renaming a secret or editing its comment without value.read
      allowOnly(infisicalSecretUpdatePermission.name);
      const { secretValue: _omitted, ...withoutValue } = secretData;

      const response = await request(app)
        .patch('/secrets/secret1')
        .send({ ...withoutValue, secretKey: 'RENAMED', secretComment: 'new' });

      expect(response.status).toBe(200);
      const [payload] = mockInfisicalApi.updateSecret.mock.calls[0];
      expect(payload).toEqual(
        expect.objectContaining({
          secretKey: 'RENAMED',
          secretComment: 'new',
        }),
      );
      expect(payload.secretValue).toBeUndefined();
    });

    it('returns 400 when the key is missing', async () => {
      const response = await request(app).patch('/secrets/secret1').send({
        entityRef: ENTITY_REF,
        secretValue: 'updated-value',
      });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Key is a required field');
      expect(mockInfisicalApi.updateSecret).not.toHaveBeenCalled();
    });

    it.each([
      ['an empty string', ''],
      ['null', null],
      ['a number', 42],
    ])('returns 400 when secretValue is %s', async (_, secretValue) => {
      const response = await request(app)
        .patch('/secrets/secret1')
        .send({ ...secretData, secretValue });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain(
        'omit it to keep the current value',
      );
      expect(mockInfisicalApi.updateSecret).not.toHaveBeenCalled();
    });

    it('returns 404 when secretId is missing in the path', async () => {
      const response = await request(app).patch('/secrets/').send(secretData);

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /secrets/:secretId', () => {
    const secretData = {
      entityRef: ENTITY_REF,
      secretPath: '/api',
      environment: 'dev',
    };

    it('deletes a secret when allowed', async () => {
      const response = await request(app)
        .delete('/secrets/secret1')
        .send(secretData);

      expect(response.status).toBe(204);
      expect(mockInfisicalApi.deleteSecret).toHaveBeenCalledWith(
        'secret1',
        {
          workspaceId: WORKSPACE_ID,
          secretPath: '/api',
          environment: 'dev',
        },
        CONTEXT,
      );
      expect(permissions.authorize).toHaveBeenCalledWith(
        [
          {
            permission: infisicalSecretDeletePermission,
            resourceRef: ENTITY_REF,
          },
        ],
        { credentials: mockCredentials.user() },
      );
    });

    it('returns 403 when delete is denied', async () => {
      allowOnly(
        infisicalSecretReadPermission.name,
        infisicalSecretUpdatePermission.name,
      );

      const response = await request(app)
        .delete('/secrets/secret1')
        .send(secretData);

      expect(response.status).toBe(403);
      expect(mockInfisicalApi.deleteSecret).not.toHaveBeenCalled();
    });

    it('returns 400 when environment is missing', async () => {
      const response = await request(app).delete('/secrets/secret1').send({
        entityRef: ENTITY_REF,
      });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('environment');
    });

    it('uses the locked environment when the body has none', async () => {
      getEntityByRef.mockResolvedValue(
        entityWith({ 'infisical/environment': 'staging' }),
      );

      const response = await request(app)
        .delete('/secrets/secret1')
        .send({ entityRef: ENTITY_REF });

      expect(response.status).toBe(204);
      expect(mockInfisicalApi.deleteSecret).toHaveBeenCalledWith(
        'secret1',
        {
          workspaceId: WORKSPACE_ID,
          secretPath: '/',
          environment: 'staging',
        },
        CONTEXT,
      );
    });

    it('handles not found errors from the API', async () => {
      mockInfisicalApi.deleteSecret.mockRejectedValueOnce(
        new NotFoundError('Secret not found'),
      );

      const response = await request(app)
        .delete('/secrets/nonexistent')
        .send(secretData);

      expect(response.status).toBe(404);
      expect(response.body.error.message).toContain('Secret not found');
    });
  });

  describe('machine identities', () => {
    function expectNoInfisicalCalls() {
      for (const api of [mockInfisicalApi, ...Object.values(mockIdentityApis)]) {
        for (const method of Object.values(api)) {
          expect(method).not.toHaveBeenCalled();
        }
      }
    }

    beforeEach(() => {
      for (const api of Object.values(mockIdentityApis)) {
        api.getSecrets.mockResolvedValue(mockSecrets);
        api.getSecretById.mockResolvedValue(mockSecrets.secrets[0]);
        api.getEnvironments.mockResolvedValue(mockProject);
        api.createSecret.mockResolvedValue(mockSecrets.secrets[0]);
        api.updateSecret.mockResolvedValue(mockSecrets.secrets[0]);
        api.deleteSecret.mockResolvedValue(undefined);
      }
    });

    it('uses the default identity without an identity annotation', async () => {
      const response = await request(app).get(
        `/secrets?entityRef=${ENTITY_REF}&environment=dev`,
      );

      expect(response.status).toBe(200);
      expect(mockInfisicalApi.getSecrets).toHaveBeenCalled();
      expect(mockIdentityApis['payments-dev'].getSecrets).not.toHaveBeenCalled();
    });

    it('uses the identity from infisical/identity', async () => {
      getEntityByRef.mockResolvedValue(
        entityWith({ 'infisical/identity': 'payments-dev' }),
      );

      const response = await request(app).get(
        `/secrets?entityRef=${ENTITY_REF}&environment=dev`,
      );

      expect(response.status).toBe(200);
      expect(mockIdentityApis['payments-dev'].getSecrets).toHaveBeenCalledWith(
        WORKSPACE_ID,
        undefined,
        'dev',
        CONTEXT,
      );
      expect(mockInfisicalApi.getSecrets).not.toHaveBeenCalled();
    });

    describe('with a per-environment override', () => {
      beforeEach(() => {
        getEntityByRef.mockResolvedValue(
          entityWith({
            'infisical/identity': 'payments-dev',
            'infisical/identity.prod': 'payments-prod',
          }),
        );
      });

      it('uses the override for that environment', async () => {
        const response = await request(app).patch('/secrets/API_KEY').send({
          entityRef: ENTITY_REF,
          secretKey: 'API_KEY',
          secretValue: 'v2',
          environment: 'prod',
        });

        expect(response.status).toBe(200);
        expect(
          mockIdentityApis['payments-prod'].updateSecret,
        ).toHaveBeenCalledWith(
          expect.objectContaining({ environment: 'prod' }),
          'API_KEY',
          CONTEXT,
        );
        expect(
          mockIdentityApis['payments-dev'].updateSecret,
        ).not.toHaveBeenCalled();
      });

      it('uses the default annotation for other environments', async () => {
        const response = await request(app).post('/secrets').send({
          entityRef: ENTITY_REF,
          secretKey: 'API_KEY',
          secretValue: 'v1',
          environment: 'dev',
        });

        expect(response.status).toBe(201);
        expect(mockIdentityApis['payments-dev'].createSecret).toHaveBeenCalled();
        expect(
          mockIdentityApis['payments-prod'].createSecret,
        ).not.toHaveBeenCalled();
      });

      it('uses the default annotation to list environments', async () => {
        const response = await request(app).get(
          `/environments?entityRef=${ENTITY_REF}`,
        );

        expect(response.status).toBe(200);
        expect(
          mockIdentityApis['payments-dev'].getEnvironments,
        ).toHaveBeenCalledWith(WORKSPACE_ID, CONTEXT);
      });

      it('uses the override to reveal and delete', async () => {
        await request(app).get(
          `/secrets/API_KEY?entityRef=${ENTITY_REF}&environment=prod`,
        );
        await request(app)
          .delete('/secrets/API_KEY')
          .send({ entityRef: ENTITY_REF, environment: 'prod' });

        expect(
          mockIdentityApis['payments-prod'].getSecretById,
        ).toHaveBeenCalled();
        expect(
          mockIdentityApis['payments-prod'].deleteSecret,
        ).toHaveBeenCalled();
      });
    });

    it('uses the override of the locked environment to list environments', async () => {
      getEntityByRef.mockResolvedValue(
        entityWith({
          'infisical/environment': 'prod',
          'infisical/identity': 'payments-dev',
          'infisical/identity.prod': 'payments-prod',
        }),
      );

      const response = await request(app).get(
        `/environments?entityRef=${ENTITY_REF}`,
      );

      expect(response.status).toBe(200);
      expect(
        mockIdentityApis['payments-prod'].getEnvironments,
      ).toHaveBeenCalled();
    });

    it('returns 404 when the identity is not configured', async () => {
      getEntityByRef.mockResolvedValue(
        entityWith({ 'infisical/identity': 'unknown' }),
      );

      const response = await request(app).get(
        `/secrets?entityRef=${ENTITY_REF}`,
      );

      expect(response.status).toBe(404);
      expect(response.body.error.message).toContain(
        "Infisical identity 'unknown'",
      );
      expectNoInfisicalCalls();
    });

    it('returns 403 when the entity is not in the allowlist', async () => {
      getEntityByRef.mockResolvedValue(
        entityWith({ 'infisical/identity': 'restricted' }),
      );

      const response = await request(app).get(
        `/secrets?entityRef=${ENTITY_REF}`,
      );

      expect(response.status).toBe(403);
      expect(response.body.error.message).toContain(
        "is not allowed to use Infisical identity 'restricted'",
      );
      expectNoInfisicalCalls();
    });

    it('allows entities in the allowlist', async () => {
      getEntityByRef.mockResolvedValue(
        entityWith({ 'infisical/identity': 'restricted' }),
      );

      const response = await request(app).get(
        '/secrets?entityRef=component:default/allowed',
      );

      expect(response.status).toBe(200);
      expect(mockIdentityApis.restricted.getSecrets).toHaveBeenCalledWith(
        WORKSPACE_ID,
        undefined,
        undefined,
        {
          userRef: 'user:default/mock',
          entityRef: 'component:default/allowed',
        },
      );
    });

    it('checks permissions before resolving the identity', async () => {
      denyAll();
      getEntityByRef.mockResolvedValue(
        entityWith({ 'infisical/identity': 'unknown' }),
      );

      const response = await request(app).get(
        `/secrets?entityRef=${ENTITY_REF}`,
      );

      expect(response.status).toBe(403);
      expect(response.body.error.message).not.toContain('unknown');
    });

    it('sends the calling user in the audit context', async () => {
      const response = await request(app)
        .get(`/secrets?entityRef=${ENTITY_REF}`)
        .set('Authorization', mockCredentials.user.header('user:default/jane'));

      expect(response.status).toBe(200);
      expect(mockInfisicalApi.getSecrets).toHaveBeenCalledWith(
        WORKSPACE_ID,
        undefined,
        undefined,
        { userRef: 'user:default/jane', entityRef: ENTITY_REF },
      );
    });

    it('sends service principals in the audit context', async () => {
      const response = await request(app)
        .get(`/secrets?entityRef=${ENTITY_REF}`)
        .set('Authorization', mockCredentials.service.header());

      expect(response.status).toBe(200);
      expect(mockInfisicalApi.getSecrets).toHaveBeenCalledWith(
        WORKSPACE_ID,
        undefined,
        undefined,
        {
          userRef: expect.stringMatching(/^service:.+/),
          entityRef: ENTITY_REF,
        },
      );
    });
  });

  describe('without a default identity', () => {
    let appWithoutDefault: express.Express;

    beforeAll(async () => {
      // setupTests resets mock implementations after every test
      jest.mocked(InfisicalApiClient).mockImplementation(mockClientFor as any);

      const router = await createRouter({
        logger: mockServices.rootLogger(),
        config: new ConfigReader({
          infisical: {
            identities: {
              'payments-dev': universalAuth,
              'payments-prod': universalAuth,
            },
          },
        }),
        httpAuth: mockServices.httpAuth(),
        auth: mockServices.auth(),
        permissions,
        catalog: { getEntityByRef } as unknown as CatalogService,
      });
      appWithoutDefault = express().use(router).use(mockErrorHandler());
    });

    it('fails to list environments with only per-environment identities', async () => {
      getEntityByRef.mockResolvedValue(
        entityWith({
          'infisical/identity.dev': 'payments-dev',
          'infisical/identity.prod': 'payments-prod',
        }),
      );

      const response = await request(appWithoutDefault).get(
        `/environments?entityRef=${ENTITY_REF}`,
      );

      expect(response.status).toBe(404);
      expect(response.body.error.message).toContain(
        'Set the infisical/identity annotation or configure infisical.authentication',
      );
      for (const api of Object.values(mockIdentityApis)) {
        expect(api.getEnvironments).not.toHaveBeenCalled();
      }
    });
  });
});
