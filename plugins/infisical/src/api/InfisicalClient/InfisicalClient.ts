/**
 * API client for interacting with Infisical secrets management
 */

import {
  createApiRef,
  DiscoveryApi,
  FetchApi,
} from '@backstage/core-plugin-api';
import { ResponseError } from '@backstage/errors';
import {
  InfisicalSecret,
  InfisicalSecretFormValues,
  InfisicalWorkspace,
  InfisicalFolder,
  InfisicalEnvironment,
} from '../types';

/**
 * API Reference for the Infisical plugin
 */
export const infisicalApiRef = createApiRef<InfisicalApi>({
  id: 'plugin.infisical.service',
});

/**
 * Options for fetching and operating on secrets
 */
export interface InfisicalOptions {
  path?: string;
  environment?: string;
  viewSecretValue?: boolean;
}

/**
 * Response interface for getSecrets method
 */
export interface GetSecretsResponse {
  secrets: InfisicalSecret[];
  folders: InfisicalFolder[];
}

/**
 * Response interface for getEnvironments method
 */
export interface GetEnvironmentsResponse {
  environments: InfisicalEnvironment[];
  name?: string;
}

/**
 * API interface for Infisical operations
 */
export interface InfisicalApi {
  /**
   * Fetches all workspaces from Infisical
   */
  getWorkspaces(): Promise<InfisicalWorkspace[]>;

  /**
   * Fetches environments for a specific workspace
   * @param workspaceId - ID of the workspace to fetch environments for
   */
  getEnvironments(workspaceId: string): Promise<GetEnvironmentsResponse>;

  /**
   * Fetches secrets for a specific workspace with optional path and environment
   * @param workspaceId - ID of the workspace to fetch secrets for
   * @param options - Optional path and environment filters
   */
  getSecrets(
    workspaceId: string,
    options?: InfisicalOptions,
  ): Promise<GetSecretsResponse>;

  /**
   * Fetches a specific secret by ID
   * @param workspaceId - ID of the workspace containing the secret
   * @param secretKey - Key of the secret to fetch
   * @param options - Optional path and environment
   */
  getSecretByKey(
    workspaceId: string,
    secretKey: string,
    options?: InfisicalOptions,
  ): Promise<InfisicalSecret>;

  /**
   * Creates a new secret in Infisical
   * @param workspaceId - ID of the workspace to create the secret in
   * @param secretData - Secret data to create
   * @param options - Optional path and environment
   */
  createSecret(
    workspaceId: string,
    secretData: InfisicalSecretFormValues,
    options?: InfisicalOptions,
  ): Promise<InfisicalSecret>;

  /**
   * Updates an existing secret in Infisical
   * @param workspaceId - ID of the workspace containing the secret
   * @param secretId - ID of the secret to update
   * @param secretData - Updated secret data
   * @param options - Optional path and environment
   */
  updateSecret(
    workspaceId: string,
    secretId: string,
    secretData: InfisicalSecretFormValues,
    options?: InfisicalOptions,
  ): Promise<InfisicalSecret>;

  /**
   * Deletes a secret from Infisical
   * @param workspaceId - ID of the workspace containing the secret
   * @param secretId - ID of the secret to delete
   * @param options - Optional path and environment
   */
  deleteSecret(
    workspaceId: string,
    secretId: string,
    options?: InfisicalOptions,
  ): Promise<void>;
}

/**
 * Implementation of the Infisical API client
 */
export class InfisicalClient implements InfisicalApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  /**
   * Gets the base URL for the Infisical backend
   */
  private async getBaseUrl(): Promise<string> {
    return await this.discoveryApi.getBaseUrl('infisical-backend');
  }

  /**
   * Validates that a workspace ID is provided
   */
  private validateWorkspaceId(workspaceId: string): void {
    if (!workspaceId) {
      throw new Error(
        'No workspace ID provided. Set the infisical/projectId annotation in the entity yaml files',
      );
    }
  }

  /**
   * Extracts detailed error information from API responses
   */
  private async handleApiError(response: Response): Promise<never> {
    let errorMessage = '';
    try {
      const errorData = await response.json();

      // Extract the most relevant message
      if (typeof errorData === 'object') {
        // Check for nested message in error object (most common case)
        if (errorData.message) {
          // Extract only the actual message without stack trace
          const messageMatch = /^(.*?)(\n|$)/.exec(errorData.message);
          errorMessage = messageMatch ? messageMatch[1] : errorData.message;
        } else if (errorData.error) {
          if (typeof errorData.error === 'object' && errorData.error.message) {
            errorMessage = errorData.error.message;
          } else {
            errorMessage = String(errorData.error);
          }
        } else if (errorData.details) {
          errorMessage =
            typeof errorData.details === 'object'
              ? JSON.stringify(errorData.details)
              : errorData.details;
        } else {
          // If we can't find a specific message field, use a simplified version
          const simplified = { ...errorData };
          delete simplified.stack;
          errorMessage = JSON.stringify(simplified);
        }
      } else if (typeof errorData === 'string') {
        errorMessage = errorData;
      }
    } catch (e) {
      // If we can't parse JSON, use the status text
      errorMessage = response.statusText;
    }

    const error = await ResponseError.fromResponse(response);
    error.message = errorMessage || error.message;
    throw error;
  }

  /**
   * Fetches all workspaces from Infisical
   */
  async getWorkspaces(): Promise<InfisicalWorkspace[]> {
    const baseUrl = await this.getBaseUrl();
    const response = await this.fetchApi.fetch(`${baseUrl}/workspaces`);

    if (!response.ok) {
      return this.handleApiError(response);
    }

    return await response.json();
  }

  /**
   * Fetches environments for a specific workspace
   */
  async getEnvironments(workspaceId: string): Promise<GetEnvironmentsResponse> {
    this.validateWorkspaceId(workspaceId);

    const baseUrl = await this.getBaseUrl();
    const response = await this.fetchApi.fetch(
      `${baseUrl}/environments?workspaceId=${encodeURIComponent(workspaceId)}`,
    );

    if (!response.ok) {
      return this.handleApiError(response);
    }

    return await response.json();
  }

  /**
   * Fetches secrets for a specific workspace
   */
  async getSecrets(
    workspaceId: string,
    options?: InfisicalOptions,
  ): Promise<GetSecretsResponse> {
    this.validateWorkspaceId(workspaceId);

    const baseUrl = await this.getBaseUrl();
    const queryParams = new URLSearchParams();
    queryParams.append('workspaceId', workspaceId);

    if (options?.path && options.path !== '/') {
      queryParams.append('path', options.path);
    }

    if (options?.environment) {
      queryParams.append('environment', options.environment);
    }

    const response = await this.fetchApi.fetch(
      `${baseUrl}/secrets?${queryParams.toString()}`,
    );

    if (!response.ok) {
      return this.handleApiError(response);
    }

    return await response.json();
  }

  /**
   * Fetches a specific secret by ID
   */
  async getSecretByKey(
    workspaceId: string,
    secretKey: string,
    options?: InfisicalOptions,
  ): Promise<InfisicalSecret> {
    this.validateWorkspaceId(workspaceId);

    const baseUrl = await this.getBaseUrl();
    const queryParams = new URLSearchParams();
    queryParams.append('workspaceId', workspaceId);

    if (options?.path && options.path !== '/') {
      queryParams.append('path', options.path);
    }

    if (options?.environment) {
      queryParams.append('environment', options.environment);
    }

    const response = await this.fetchApi.fetch(
      `${baseUrl}/secrets/${encodeURIComponent(
        secretKey,
      )}?${queryParams.toString()}`,
    );

    if (!response.ok) {
      return this.handleApiError(response);
    }

    return await response.json();
  }

  /**
   * Creates a new secret in Infisical
   */
  async createSecret(
    workspaceId: string,
    secretData: InfisicalSecretFormValues,
    options?: InfisicalOptions,
  ): Promise<InfisicalSecret> {
    this.validateWorkspaceId(workspaceId);

    const baseUrl = await this.getBaseUrl();

    const body = {
      ...secretData,
      secretPath: options?.path,
      workspaceId,
      environment: options?.environment,
    };

    const response = await this.fetchApi.fetch(`${baseUrl}/secrets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return this.handleApiError(response);
    }

    return await response.json();
  }

  /**
   * Updates an existing secret in Infisical
   */
  async updateSecret(
    workspaceId: string,
    secretId: string,
    secretData: InfisicalSecretFormValues,
    options?: InfisicalOptions,
  ): Promise<InfisicalSecret> {
    this.validateWorkspaceId(workspaceId);

    const baseUrl = await this.getBaseUrl();
    const body = {
      ...secretData,
      secretPath: options?.path,
      workspaceId,
      environment: options?.environment,
    };

    const response = await this.fetchApi.fetch(
      `${baseUrl}/secrets/${encodeURIComponent(secretId)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      return this.handleApiError(response);
    }

    return await response.json();
  }

  /**
   * Deletes a secret from Infisical
   */
  async deleteSecret(
    workspaceId: string,
    secretId: string,
    options?: InfisicalOptions,
  ): Promise<void> {
    this.validateWorkspaceId(workspaceId);

    const baseUrl = await this.getBaseUrl();
    const body = {
      secretPath: options?.path,
      workspaceId,
      environment: options?.environment,
    };

    const response = await this.fetchApi.fetch(
      `${baseUrl}/secrets/${encodeURIComponent(secretId)}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      this.handleApiError(response);
    }
  }
}
