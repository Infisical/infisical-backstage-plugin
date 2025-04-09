/**
 * Tests for InfisicalClient API client
 */

import { InfisicalClient } from './InfisicalClient';
import { InfisicalSecretFormValues } from './types';
import { UrlPatternDiscovery } from '@backstage/core-app-api';
import { fetchApiRef } from '@backstage/core-plugin-api';

describe('InfisicalClient', () => {
  const mockBaseUrl = 'http://localhost:7007/api/infisical-backend';
  const mockDiscoveryApi = UrlPatternDiscovery.compile(
    'http://localhost:7007/api/infisical-backend',
  );

  const mockFetchApi = {
    fetch: jest.fn(),
  };

  const mockWorkspaceId = 'test-workspace-id';

  let client: InfisicalClient;

  beforeEach(() => {
    jest.resetAllMocks();
    client = new InfisicalClient({
      discoveryApi: mockDiscoveryApi,
      fetchApi: mockFetchApi as any,
    });
  });

  describe('getWorkspaces', () => {
    it('should fetch workspaces from the correct URL', async () => {
      const mockResponse = [{ id: '1', name: 'Test Workspace' }];
      mockFetchApi.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getWorkspaces();

      expect(mockFetchApi.fetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/workspaces`,
      );
      expect(result).toEqual(mockResponse);
    });

    it('should throw an error if the response is not ok', async () => {
      const errorResponse = { message: 'Failed to fetch workspaces' };
      mockFetchApi.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => JSON.stringify(errorResponse),
        headers: new Headers(),
      });

      await expect(client.getWorkspaces()).rejects.toThrow();
    });
  });

  describe('getEnvironments', () => {
    it('should fetch environments for the specified workspace', async () => {
      const mockResponse = {
        environments: [{ id: '1', name: 'Development', slug: 'development' }],
      };
      mockFetchApi.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getEnvironments(mockWorkspaceId);

      expect(mockFetchApi.fetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/environments?workspaceId=${mockWorkspaceId}`,
      );
      expect(result).toEqual(mockResponse);
    });

    it('should throw an error if no workspace ID is provided', async () => {
      await expect(client.getEnvironments('')).rejects.toThrow(
        'No workspace ID provided',
      );
      expect(mockFetchApi.fetch).not.toHaveBeenCalled();
    });
  });

  describe('getSecrets', () => {
    it('should fetch secrets with the correct parameters', async () => {
      const mockResponse = {
        secrets: [{ id: '1', key: 'API_KEY', value: 'test-value' }],
        folders: [{ id: '1', name: 'folder', path: '/folder' }],
      };
      mockFetchApi.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getSecrets(mockWorkspaceId, {
        path: '/test-path',
        environment: 'development',
      });

      expect(mockFetchApi.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`${mockBaseUrl}/secrets?`),
      );
      expect(mockFetchApi.fetch.mock.calls[0][0]).toContain(
        'workspaceId=test-workspace-id',
      );
      expect(mockFetchApi.fetch.mock.calls[0][0]).toContain(
        'path=%2Ftest-path',
      );
      expect(mockFetchApi.fetch.mock.calls[0][0]).toContain(
        'environment=development',
      );
      expect(result).toEqual(mockResponse);
    });

    it('should throw an error if no workspace ID is provided', async () => {
      await expect(client.getSecrets('')).rejects.toThrow(
        'No workspace ID provided',
      );
      expect(mockFetchApi.fetch).not.toHaveBeenCalled();
    });
  });

  describe('createSecret', () => {
    it('should create a secret with the correct data', async () => {
      const secretData: InfisicalSecretFormValues = {
        secretKey: 'NEW_API_KEY',
        secretValue: 'new-api-key-value',
        secretComment: 'Test comment',
      };

      const mockResponse = {
        id: '123',
        key: 'NEW_API_KEY',
        secretKey: 'NEW_API_KEY',
        value: 'new-api-key-value',
        secretValue: 'new-api-key-value',
        type: 'shared',
        comment: 'Test comment',
        secretComment: 'Test comment',
        createdAt: '2023-01-01',
        updatedAt: '2023-01-01',
        readonly: false,
      };

      mockFetchApi.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.createSecret(mockWorkspaceId, secretData, {
        path: '/test-path',
        environment: 'development',
      });

      expect(mockFetchApi.fetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/secrets`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: expect.any(String),
        }),
      );

      const requestBody = JSON.parse(mockFetchApi.fetch.mock.calls[0][1].body);
      expect(requestBody).toEqual({
        ...secretData,
        secretPath: '/test-path',
        workspaceId: mockWorkspaceId,
        environment: 'development',
      });

      expect(result).toEqual(mockResponse);
    });
  });

  describe('updateSecret', () => {
    it('should update a secret with the correct data', async () => {
      const secretId = 'secret-id-123';
      const secretData: InfisicalSecretFormValues = {
        secretKey: 'UPDATED_API_KEY',
        secretValue: 'updated-api-key-value',
        secretComment: 'Updated comment',
      };

      const mockResponse = {
        id: secretId,
        key: 'UPDATED_API_KEY',
        secretKey: 'UPDATED_API_KEY',
        value: 'updated-api-key-value',
        secretValue: 'updated-api-key-value',
        type: 'shared',
        comment: 'Updated comment',
        secretComment: 'Updated comment',
        createdAt: '2023-01-01',
        updatedAt: '2023-01-02',
        readonly: false,
      };

      mockFetchApi.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.updateSecret(
        mockWorkspaceId,
        secretId,
        secretData,
        {
          path: '/test-path',
          environment: 'development',
        },
      );

      expect(mockFetchApi.fetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/secrets/${secretId}`,
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: expect.any(String),
        }),
      );

      const requestBody = JSON.parse(mockFetchApi.fetch.mock.calls[0][1].body);
      expect(requestBody).toEqual({
        ...secretData,
        secretPath: '/test-path',
        workspaceId: mockWorkspaceId,
        environment: 'development',
      });

      expect(result).toEqual(mockResponse);
    });
  });

  describe('deleteSecret', () => {
    it('should delete a secret with the correct parameters', async () => {
      const secretId = 'secret-id-123';

      mockFetchApi.fetch.mockResolvedValueOnce({
        ok: true,
      });

      await client.deleteSecret(mockWorkspaceId, secretId, {
        path: '/test-path',
        environment: 'development',
      });

      expect(mockFetchApi.fetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/secrets/${secretId}`,
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: expect.any(String),
        }),
      );

      const requestBody = JSON.parse(mockFetchApi.fetch.mock.calls[0][1].body);
      expect(requestBody).toEqual({
        secretPath: '/test-path',
        workspaceId: mockWorkspaceId,
        environment: 'development',
      });
    });
  });
});
