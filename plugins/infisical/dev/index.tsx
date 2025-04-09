/**
 * Development setup for the Infisical plugin
 */

import React from 'react';
import { createDevApp } from '@backstage/dev-utils';
import { TestApiProvider, MockEntityProvider } from '@backstage/test-utils';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { Entity } from '@backstage/catalog-model';
import { Grid } from '@material-ui/core';
import {
  infisicalPlugin,
  EntityInfisicalContent,
  infisicalApiRef
} from '../src/plugin';
import { InfisicalClient } from '../src/api/InfisicalClient/InfisicalClient';
import {
  InfisicalSecret,
  InfisicalFolder,
  InfisicalEnvironment,
  InfisicalWorkspace
} from '../src/api/types';

// Mock entity with Infisical annotation
const mockEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'example-component',
    annotations: {
      'infisical/project': 'mock-project-id',
    },
  },
  spec: {
    type: 'service',
    lifecycle: 'production',
    owner: 'guests',
  },
};

// Mock data for development
const mockWorkspaces: InfisicalWorkspace[] = [
  { id: 'mock-project-id', name: 'Mock Project' }
];

const mockEnvironments: InfisicalEnvironment[] = [
  { id: 'env-1', name: 'Development', slug: 'development' },
  { id: 'env-2', name: 'Staging', slug: 'staging' },
  { id: 'env-3', name: 'Production', slug: 'production' }
];

const mockFolders: InfisicalFolder[] = [
  { id: 'folder-1', name: 'api', path: '/api', createdAt: '2023-01-01', updatedAt: '2023-01-01' },
  { id: 'folder-2', name: 'database', path: '/database', createdAt: '2023-01-01', updatedAt: '2023-01-01' }
];

const mockSecrets: InfisicalSecret[] = [
  {
    id: 'secret-1',
    key: 'API_KEY',
    secretKey: 'API_KEY',
    value: 'secret-api-key-value',
    secretValue: 'secret-api-key-value',
    type: 'shared',
    createdAt: '2023-01-01',
    updatedAt: '2023-01-01',
    readonly: false
  },
  {
    id: 'secret-2',
    key: 'DATABASE_URL',
    secretKey: 'DATABASE_URL',
    value: 'postgres://user:password@localhost:5432/db',
    secretValue: 'postgres://user:password@localhost:5432/db',
    type: 'shared',
    comment: 'Database connection string',
    secretComment: 'Database connection string',
    createdAt: '2023-01-01',
    updatedAt: '2023-01-01',
    readonly: false
  }
];

// Create a mock implementation of the InfisicalClient
const mockClient = {
  getWorkspaces: async () => mockWorkspaces,
  getEnvironments: async () => ({ environments: mockEnvironments }),
  getSecrets: async () => ({
    secrets: mockSecrets,
    folders: mockFolders,
  }),
  createSecret: async (workspaceId: string, secretData: any) => ({
    ...secretData,
    id: `generated-id-${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    readonly: false,
    type: 'shared',
    key: secretData.secretKey,
    value: secretData.secretValue
  }),
  updateSecret: async (workspaceId: string, secretId: string, secretData: any) => ({
    ...secretData,
    id: secretId,
    updatedAt: new Date().toISOString(),
    readonly: false,
    type: 'shared',
    key: secretData.secretKey,
    value: secretData.secretValue
  }),
  deleteSecret: async () => { }
};

createDevApp()
  .registerPlugin(infisicalPlugin)
  .addPage({
    element: (
      <TestApiProvider
        apis={[[infisicalApiRef, mockClient]]}
      >
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <MockEntityProvider entity={mockEntity}>
              <EntityInfisicalContent />
            </MockEntityProvider>
          </Grid>
        </Grid>
      </TestApiProvider>
    ),
    title: 'Infisical Secrets',
    path: '/infisical',
  })
  .render();