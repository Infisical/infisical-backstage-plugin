/**
 * Mock data and utilities for testing
 */

import {
  InfisicalSecret,
  InfisicalFolder,
  InfisicalEnvironment,
  InfisicalWorkspace,
} from './src/api/types';

/**
 * Mock workspaces for testing
 */
export const mockWorkspaces: InfisicalWorkspace[] = [
  { id: 'workspace-1', name: 'Frontend Service' },
  { id: 'workspace-2', name: 'Backend API' },
];

/**
 * Mock environments for testing
 */
export const mockEnvironments: InfisicalEnvironment[] = [
  { id: 'env-1', name: 'Development', slug: 'development' },
  { id: 'env-2', name: 'Staging', slug: 'staging' },
  { id: 'env-3', name: 'Production', slug: 'production' },
];

/**
 * Mock folders for testing
 */
export const mockFolders: InfisicalFolder[] = [
  {
    id: 'folder-1',
    name: 'api',
    path: '/api',
    createdAt: '2023-01-01',
    updatedAt: '2023-01-01',
  },
  {
    id: 'folder-2',
    name: 'database',
    path: '/database',
    createdAt: '2023-01-01',
    updatedAt: '2023-01-01',
  },
  {
    id: 'folder-3',
    name: 'auth',
    path: '/api/auth',
    createdAt: '2023-01-01',
    updatedAt: '2023-01-01',
  },
];

/**
 * Mock secrets for testing
 */
export const mockSecrets: InfisicalSecret[] = [
  {
    id: 'secret-1',
    key: 'API_KEY',
    secretKey: 'API_KEY',
    value: 'test-api-key-12345',
    secretValue: 'test-api-key-12345',
    type: 'shared',
    comment: 'API Key for external service',
    secretComment: 'API Key for external service',
    createdAt: '2023-01-01',
    updatedAt: '2023-01-01',
    readonly: false,
  },
  {
    id: 'secret-2',
    key: 'DATABASE_URL',
    secretKey: 'DATABASE_URL',
    value: 'postgres://user:password@localhost:5432/db',
    secretValue: 'postgres://user:password@localhost:5432/db',
    type: 'shared',
    comment: 'Local database connection string',
    secretComment: 'Local database connection string',
    createdAt: '2023-01-02',
    updatedAt: '2023-01-02',
    readonly: false,
  },
  {
    id: 'secret-3',
    key: 'JWT_SECRET',
    secretKey: 'JWT_SECRET',
    value: 'super-secret-jwt-token',
    secretValue: 'super-secret-jwt-token',
    type: 'shared',
    createdAt: '2023-01-03',
    updatedAt: '2023-01-03',
    readonly: true,
  },
];

/**
 * Creates a mock secret with the given key and value
 *
 * @param key - Secret key
 * @param value - Secret value
 * @param comment - Optional comment
 * @returns A mock InfisicalSecret object
 */
export function createMockSecret(
  key: string,
  value: string,
  comment?: string,
): InfisicalSecret {
  return {
    id: `secret-${Date.now()}`,
    key,
    secretKey: key,
    value,
    secretValue: value,
    type: 'shared',
    comment,
    secretComment: comment,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    readonly: false,
  };
}

/**
 * Creates a mock folder with the given name
 *
 * @param name - Folder name
 * @param basePath - Base path to prefix (default: '/')
 * @returns A mock InfisicalFolder object
 */
export function createMockFolder(
  name: string,
  basePath: string = '/',
): InfisicalFolder {
  const path = basePath === '/' ? `/${name}` : `${basePath}/${name}`;
  return {
    id: `folder-${Date.now()}`,
    name,
    path,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
