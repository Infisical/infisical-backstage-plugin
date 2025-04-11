import express from 'express';
import request from 'supertest';
import { createRouter } from './router';
import * as infisicalApiModule from './infisicalApi';
import { ConfigReader } from '@backstage/config';
import { getVoidLogger } from '@backstage/backend-common';
import { InfisicalSecret, InfisicalProject } from './types';
import { NotFoundError, ConflictError } from '@backstage/errors';

const mockInfisicalApi = {
  getSecrets: jest.fn(),
  getEnvironments: jest.fn(),
  createSecret: jest.fn(),
  updateSecret: jest.fn(),
  deleteSecret: jest.fn(),
};

jest.mock('./infisicalApi', () => {
  return {
    InfisicalApiClient: jest.fn().mockImplementation(() => mockInfisicalApi),
  };
});

jest.mock('@backstage/backend-common', () => {
  const actual = jest.requireActual('@backstage/backend-common');
  return {
    ...actual,
    errorHandler: () => (err: Error, _req: any, res: any, next: any) => {
      if (res.headersSent) {
        next(err);
        return;
      }

      let status;
      switch (err.name) {
        case 'InputError':
          status = 400;
          break;
        case 'NotFoundError':
          status = 404;
          break;
        case 'ConflictError':
          status = 409;
          break;
        default:
          status = 500;
      }

      res.status(status).json({
        error: { message: err.message },
        message: err.message,
        name: err.name,
        status,
      });
    },
  };
});

describe('infisical router', () => {
  let app: express.Express;

  beforeAll(async () => {
    const router = await createRouter({
      logger: getVoidLogger(),
      config: new ConfigReader({}),
    });

    app = express().use(router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /secrets', () => {
    it('returns secrets when valid workspaceId is provided', async () => {
      const mockSecrets = {
        secrets: [
          { id: 'secret1', secretKey: 'API_KEY', secretValue: 'test-value' },
        ] as InfisicalSecret[],
        folders: [],
      };

      mockInfisicalApi.getSecrets.mockResolvedValueOnce(mockSecrets);

      const response = await request(app).get(
        '/secrets?workspaceId=workspace123&path=/api&environment=dev',
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockSecrets);
      expect(mockInfisicalApi.getSecrets).toHaveBeenCalledWith(
        'workspace123',
        '/api',
        'dev',
      );
    });

    it('returns 400 when workspaceId is missing', async () => {
      const response = await request(app).get('/secrets');

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('workspaceId is required');
    });

    it('handles API errors correctly', async () => {
      mockInfisicalApi.getSecrets.mockRejectedValueOnce(
        new NotFoundError('Workspace not found'),
      );

      const response = await request(app).get(
        '/secrets?workspaceId=nonexistent',
      );

      expect(response.status).toBe(404);
      expect(response.body.error.message).toContain('Workspace not found');
    });
  });

  describe('GET /environments', () => {
    it('returns environments when valid workspaceId is provided', async () => {
      const mockProject: InfisicalProject = {
        id: 'project1',
        name: 'Test Project',
        slug: 'test-project',
        environments: [
          { id: 'env1', name: 'Development', slug: 'dev' },
          { id: 'env2', name: 'Production', slug: 'prod' },
        ],
      };

      mockInfisicalApi.getEnvironments.mockResolvedValueOnce(mockProject);

      const response = await request(app).get(
        '/environments?workspaceId=workspace123',
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockProject);
      expect(mockInfisicalApi.getEnvironments).toHaveBeenCalledWith(
        'workspace123',
      );
    });

    it('returns 400 when workspaceId is missing', async () => {
      const response = await request(app).get('/environments');

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('workspaceId is required');
    });
  });

  describe('POST /secrets', () => {
    it('creates a secret when valid data is provided', async () => {
      const mockSecret: InfisicalSecret = {
        id: 'secret1',
        secretKey: 'API_KEY',
        secretValue: 'test-value',
      };

      const secretData = {
        secretKey: 'API_KEY',
        secretValue: 'test-value',
        workspaceId: 'workspace123',
        secretPath: '/api',
        environment: 'dev',
      };

      mockInfisicalApi.createSecret.mockResolvedValueOnce(mockSecret);

      const response = await request(app).post('/secrets').send(secretData);

      expect(response.status).toBe(201);
      expect(response.body).toEqual(mockSecret);
      expect(mockInfisicalApi.createSecret).toHaveBeenCalledWith(secretData);
    });

    it('returns 400 when required fields are missing', async () => {
      const response = await request(app).post('/secrets').send({
        workspaceId: 'workspace123',
      });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain(
        'Key and value are required fields',
      );
    });

    it('handles conflict errors from the API', async () => {
      const secretData = {
        secretKey: 'EXISTING_KEY',
        secretValue: 'test-value',
        workspaceId: 'workspace123',
      };

      mockInfisicalApi.createSecret.mockRejectedValueOnce(
        new ConflictError('Secret with this key already exists'),
      );

      const response = await request(app).post('/secrets').send(secretData);

      expect(response.status).toBe(409);
      expect(response.body.error.message).toContain('already exists');
    });
  });

  describe('PATCH /secrets/:secretId', () => {
    it('updates a secret when valid data is provided', async () => {
      const mockSecret: InfisicalSecret = {
        id: 'secret1',
        secretKey: 'API_KEY',
        secretValue: 'updated-value',
      };

      const secretData = {
        secretKey: 'API_KEY',
        secretValue: 'updated-value',
        workspaceId: 'workspace123',
        secretPath: '/api',
        environment: 'dev',
      };

      mockInfisicalApi.updateSecret.mockResolvedValueOnce(mockSecret, 'secret1');

      const response = await request(app)
        .patch('/secrets/secret1')
        .send(secretData);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockSecret);
      expect(mockInfisicalApi.updateSecret).toHaveBeenCalledWith(secretData, 'secret1');
    });

    it('returns 400 when required fields are missing', async () => {
      const response = await request(app).patch('/secrets/secret1').send({
        workspaceId: 'workspace123',
      });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain(
        'Key and value are required fields',
      );
    });

    it('returns 404 when secretId is missing in the path', async () => {
      const response = await request(app).patch('/secrets/').send({
        secretKey: 'API_KEY',
        secretValue: 'test-value',
        workspaceId: 'workspace123',
      });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /secrets/:secretId', () => {
    it('deletes a secret when valid data is provided', async () => {
      const secretData = {
        workspaceId: 'workspace123',
        secretPath: '/api',
        environment: 'dev',
      };

      mockInfisicalApi.deleteSecret.mockResolvedValueOnce(undefined);

      const response = await request(app)
        .delete('/secrets/secret1')
        .send(secretData);

      expect(response.status).toBe(204);
      expect(mockInfisicalApi.deleteSecret).toHaveBeenCalledWith(
        'secret1',
        secretData,
      );
    });

    it('returns 400 when required fields are missing', async () => {
      const response = await request(app).delete('/secrets/secret1').send({
        workspaceId: 'workspace123',
      });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('workspaceId');
      expect(response.body.error.message).toContain('environment');
    });

    it('handles not found errors from the API', async () => {
      const secretData = {
        workspaceId: 'workspace123',
        secretPath: '/api',
        environment: 'dev',
      };

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
});
