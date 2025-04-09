/**
 * Mock implementation of InfisicalApi for testing
 */

import {
  InfisicalApi,
  GetEnvironmentsResponse,
  GetSecretsResponse,
} from './api/InfisicalClient';
import {
  InfisicalSecret,
  InfisicalSecretFormValues,
  InfisicalWorkspace,
} from './api/types';
import {
  mockWorkspaces,
  mockEnvironments,
  mockFolders,
  mockSecrets,
  createMockSecret,
} from './mocks';

/**
 * Creates a mock implementation of the InfisicalApi for testing
 *
 * @returns Mock InfisicalApi implementation
 */
export function createMockInfisicalApi(): InfisicalApi {
  // Create copies of the mock data to work with
  const workspaces = [...mockWorkspaces];
  const environments = [...mockEnvironments];
  const folders = [...mockFolders];
  let secrets = [...mockSecrets];

  return {
    getWorkspaces: async (): Promise<InfisicalWorkspace[]> => {
      return workspaces;
    },

    getEnvironments: async (
      workspaceId: string,
    ): Promise<GetEnvironmentsResponse> => {
      if (!workspaceId) {
        throw new Error('No workspace ID provided');
      }

      return { environments };
    },

    getSecrets: async (
      workspaceId: string,
      options?: { path?: string; environment?: string },
    ): Promise<GetSecretsResponse> => {
      if (!workspaceId) {
        throw new Error('No workspace ID provided');
      }

      // Filter folders based on path
      const filteredFolders = folders.filter(folder => {
        if (!options?.path) {
          // Root path - show top-level folders
          return folder.path.split('/').filter(Boolean).length === 1;
        }

        // Check if folder is a direct child of the current path
        const currentPathParts = options.path.split('/').filter(Boolean);
        const folderPathParts = folder.path.split('/').filter(Boolean);

        return (
          folderPathParts.length === currentPathParts.length + 1 &&
          folderPathParts.slice(0, currentPathParts.length).join('/') ===
            currentPathParts.join('/')
        );
      });

      // Filter secrets based on environment and path
      const filteredSecrets = secrets.filter(secret => {
        // No environment filtering
        if (options?.environment && secret.type !== options.environment) {
          return false;
        }

        // No path filtering for now
        return true;
      });

      // Mock a delay
      await new Promise(resolve => setTimeout(resolve, 500));

      return {
        secrets: filteredSecrets,
        folders: filteredFolders,
      };
    },

    createSecret: async (
      workspaceId: string,
      secretData: InfisicalSecretFormValues,
      options?: { path?: string; environment?: string },
    ): Promise<InfisicalSecret> => {
      if (!workspaceId) {
        throw new Error('No workspace ID provided');
      }

      const newSecret = createMockSecret(
        secretData.secretKey,
        secretData.secretValue,
        secretData.secretComment,
      );

      // Add to secrets array
      secrets = [...secrets, newSecret];

      // Mock a delay
      await new Promise(resolve => setTimeout(resolve, 500));

      return newSecret;
    },

    updateSecret: async (
      workspaceId: string,
      secretId: string,
      secretData: InfisicalSecretFormValues,
      options?: { path?: string; environment?: string },
    ): Promise<InfisicalSecret> => {
      if (!workspaceId) {
        throw new Error('No workspace ID provided');
      }

      // Find the secret to update
      const secretIndex = secrets.findIndex(s => s.id === secretId);

      if (secretIndex === -1) {
        throw new Error(`Secret with ID ${secretId} not found`);
      }

      // Create updated secret
      const updatedSecret = {
        ...secrets[secretIndex],
        key: secretData.secretKey,
        secretKey: secretData.secretKey,
        value: secretData.secretValue,
        secretValue: secretData.secretValue,
        comment: secretData.secretComment,
        secretComment: secretData.secretComment,
        updatedAt: new Date().toISOString(),
      };

      // Update the secret
      secrets = [
        ...secrets.slice(0, secretIndex),
        updatedSecret,
        ...secrets.slice(secretIndex + 1),
      ];

      // Mock a delay
      await new Promise(resolve => setTimeout(resolve, 500));

      return updatedSecret;
    },

    deleteSecret: async (
      workspaceId: string,
      secretId: string,
      options?: { path?: string; environment?: string },
    ): Promise<void> => {
      if (!workspaceId) {
        throw new Error('No workspace ID provided');
      }

      // Remove the secret
      secrets = secrets.filter(s => s.id !== secretId);

      // Mock a delay
      await new Promise(resolve => setTimeout(resolve, 500));
    },
  };
}
