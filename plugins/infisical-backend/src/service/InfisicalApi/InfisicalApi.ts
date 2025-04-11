import {
  NotFoundError,
  ConflictError,
  InputError
} from '@backstage/errors';
import { Config } from '@backstage/config';
import { Logger } from 'winston';
import {
  InfisicalFoldersResponse,
  InfisicalProject,
  InfisicalSecret,
  InfisicalSecretCreateRequest,
  InfisicalSecretResponse,
  InfisicalSecretsResponse,
  InfisicalSecretUpdateRequest,
  InfisicalSecretDeleteRequest,
  AuthTokenResponse
} from '../types';

/**
 * Authentication credentials for Infisical API
 * @internal
 */
interface AuthCredentials {
  /** Type of authentication */
  type: 'api-token' | 'client-credentials';
  /** API token when using token-based auth */
  apiToken?: string;
  /** Client ID when using OAuth client credentials */
  clientId?: string;
  /** Client secret when using OAuth client credentials */
  clientSecret?: string;
  /** Access token obtained via client credentials */
  accessToken?: string;
  /** Timestamp when the token expires */
  tokenExpiresAt?: number;
}

/**
 * Error response structure from Infisical API
 * @internal
 */
interface ErrorResponse {
  message: string;
  statusCode: number;
}

/**
 * Request options for API calls
 * @internal
 */
interface RequestOptions {
  /** Request method (GET, POST, etc.) */
  method: string;
  /** Request path (without base URL) */
  path: string;
  /** Optional request body */
  body?: unknown;
  /** Whether to enable automatic retries */
  retry?: boolean;
  /** Custom query parameters */
  queryParams?: Record<string, string | undefined>;
}

/**
 * Options for creating an Infisical API client
 * @public
 */
export interface InfisicalApiClientOptions {
  /** Configuration */
  config: Config;
  /** Logger instance */
  logger: Logger;
}

/**
 * Client for interacting with the Infisical API
 * @public
 */
export class InfisicalApiClient {
  private readonly baseUrl: string;
  private readonly logger: Logger;
  private credentials: AuthCredentials;
  private tokenRefreshInProgress: boolean = false;
  private maxRetries: number = 3;
  private retryDelay: number = 1000; // 1 second initial delay
  private retryStatusCodes: number[] = [408, 429, 500, 502, 503, 504];

  /**
   * Create a new Infisical API client
   */
  constructor(options: InfisicalApiClientOptions) {
    const { config, logger } = options;

    this.logger = logger.child({ service: 'InfisicalApiClient' });

    try {
      this.baseUrl = this.getBaseUrlFromConfig(config);
      this.credentials = this.getCredentialsFromConfig(config);

      this.logger.info(
        `Initialized Infisical API client with base URL: ${this.baseUrl}`,
      );
    } catch (error) {
      this.logger.error(`Failed to initialize Infisical API client: ${error}`);
      throw error;
    }
  }

  /**
   * Extract base URL from config
   * @internal
   */
  private getBaseUrlFromConfig(config: Config): string {
    try {
      const infisicalConfig = config.getConfig('infisical');
      return infisicalConfig.has('baseUrl')
        ? infisicalConfig.getString('baseUrl')
        : 'https://app.infisical.com';
    } catch (error) {
      throw new Error(`Failed to get Infisical base URL from config: ${error}`);
    }
  }

  /**
   * Extract auth credentials from config
   * @internal
   */
  private getCredentialsFromConfig(config: Config): AuthCredentials {
    try {
      const infisicalConfig = config.getConfig('infisical');

      // Check for API token auth
      if (infisicalConfig.has('authentication.auth_token')) {
        return {
          type: 'api-token',
          apiToken: infisicalConfig.getString(
            'authentication.auth_token.token',
          ),
        };
      }

      // Check for client credentials auth
      if (infisicalConfig.has('authentication.universalAuth')) {
        return {
          type: 'client-credentials',
          clientId: infisicalConfig.getString(
            'authentication.universalAuth.clientId',
          ),
          clientSecret: infisicalConfig.getString(
            'authentication.universalAuth.clientSecret',
          ),
        };
      }

      // No valid auth methods found
      throw new Error(
        'Missing Infisical Authentication credentials. Configure either auth_token or universalAuth on your infisical.authentication settings.',
      );
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(
        `Failed to get Infisical authentication from config: ${error}`,
      );
    }
  }

  /**
   * Authenticate with client credentials and get an access token
   * @internal
   */
  private async authenticateWithClientCredentials(): Promise<void> {
    if (this.tokenRefreshInProgress) {
      this.logger.debug('Token refresh already in progress, waiting...');
      await new Promise(resolve => setTimeout(resolve, 500));
      return;
    }

    try {
      this.tokenRefreshInProgress = true;

      if (!this.credentials.clientId || !this.credentials.clientSecret) {
        throw new Error(
          'Missing client ID or client secret for authentication',
        );
      }

      const url = `${this.baseUrl}/api/v1/auth/universal-auth/login`;

      this.logger.info('Requesting access token using client credentials');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          clientId: this.credentials.clientId,
          clientSecret: this.credentials.clientSecret,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to authenticate: ${response.status} - ${errorText}`,
        );
      }

      const tokenData = (await response.json()) as AuthTokenResponse;

      // Calculate token expiration time with a safety margin (subtract 5 minutes)
      const expiresInMs = (tokenData.expiresIn - 300) * 1000;

      this.credentials.accessToken = tokenData.accessToken;
      this.credentials.tokenExpiresAt = Date.now() + expiresInMs;

      this.logger.info(
        `Successfully authenticated. Token expires in ${
          expiresInMs / 1000 / 60
        } minutes`,
      );
    } catch (error) {
      this.logger.error(`Authentication failed: ${error}`);
      throw error;
    } finally {
      this.tokenRefreshInProgress = false;
    }
  }

  /**
   * Check if the current token is valid or needs refresh
   * @internal
   */
  private async ensureValidToken(): Promise<void> {
    if (this.credentials.type !== 'client-credentials') {
      return; // No token management needed for API token auth
    }

    // If no token exists or it's expired/about to expire
    const isTokenExpired =
      !this.credentials.accessToken ||
      !this.credentials.tokenExpiresAt ||
      Date.now() >= this.credentials.tokenExpiresAt;

    if (isTokenExpired) {
      this.logger.info('Access token expired or not present, refreshing...');
      await this.authenticateWithClientCredentials();
    }
  }

  /**
   * Get the appropriate authorization header based on auth type
   * @internal
   */
  private async getAuthorizationHeader(): Promise<string> {
    if (this.credentials.type === 'api-token') {
      return `Bearer ${this.credentials.apiToken}`;
    }

    await this.ensureValidToken();
    return `Bearer ${this.credentials.accessToken}`;
  }

  /**
   * Helper method to build a complete URL with query parameters
   * @internal
   */
  private buildUrl(
    path: string,
    queryParams?: Record<string, string | undefined>,
  ): string {
    const url = new URL(`${this.baseUrl}/api${path}`);

    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, value);
        }
      });
    }

    return url.toString();
  }

  /**
   * Parse API error response
   * @internal
   */
  private async parseErrorResponse(response: Response): Promise<Error> {
    try {
      const contentType = response.headers.get('content-type');

      // If JSON response, try to parse structured error
      if (contentType && contentType.includes('application/json')) {
        const errorData = (await response.json()) as ErrorResponse;
        return new Error(
          `Infisical API error (${response.status}): ${
            errorData.message || 'Unknown error'
          }`,
        );
      }

      // Otherwise, get text content
      const errorText = await response.text();

      // Map to appropriate error types
      switch (response.status) {
        case 404:
          return new NotFoundError(`Resource not found: ${errorText}`);
        case 409:
          return new ConflictError(`Conflict: ${errorText}`);
        case 400:
          return new InputError(`Bad request: ${errorText}`);
        default:
          return new Error(
            `Infisical API error (${response.status}): ${errorText}`,
          );
      }
    } catch (error) {
      return new Error(
        `Infisical API error (${response.status}): Failed to parse error response`,
      );
    }
  }

  /**
   * Check if a request should be retried based on error or status code
   * @internal
   */
  private shouldRetry(error: Error | null, statusCode: number | null): boolean {
    // Retry on network errors
    if (error && !error.message.includes('Invalid credentials')) {
      return true;
    }

    // Retry on specific status codes
    if (statusCode && this.retryStatusCodes.includes(statusCode)) {
      return true;
    }

    return false;
  }

  /**
   * Make an API request with automatic retry and token refresh
   * @internal
   */
  private async makeRequest<T>(
    options: RequestOptions,
    retryCount: number = 0,
  ): Promise<T> {
    const { method, path, body, queryParams } = options;
    const url = this.buildUrl(path, queryParams);
    const retry = options.retry !== false;

    this.logger.debug(`Making ${method} request to ${url}`);

    try {
      // Ensure we have a valid token before making the request
      await this.ensureValidToken();

      const authHeader = await this.getAuthorizationHeader();

      const headers = {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      this.logger.debug(
        `Received response with status ${response.status} from ${url}`,
      );

      // Handle 401 Unauthorized - could be due to expired token
      if (
        response.status === 401 &&
        this.credentials.type === 'client-credentials' &&
        retry &&
        retryCount < this.maxRetries
      ) {
        this.logger.warn(
          `Received 401 Unauthorized, refreshing token and retrying (attempt ${
            retryCount + 1
          }/${this.maxRetries})`,
        );

        // Force token refresh
        this.credentials.tokenExpiresAt = 0;
        await new Promise(resolve =>
          setTimeout(resolve, this.retryDelay * Math.pow(2, retryCount)),
        );

        // Retry the request with incremented retry count
        return this.makeRequest<T>(options, retryCount + 1);
      }

      if (!response.ok) {
        const error = await this.parseErrorResponse(response);

        // Check if we should retry based on the error
        if (
          retry &&
          retryCount < this.maxRetries &&
          this.shouldRetry(error, response.status)
        ) {
          this.logger.warn(
            `Request failed with status ${response.status}, retrying (attempt ${
              retryCount + 1
            }/${this.maxRetries})`,
          );
          await new Promise(resolve =>
            setTimeout(resolve, this.retryDelay * Math.pow(2, retryCount)),
          );
          return this.makeRequest<T>(options, retryCount + 1);
        }

        throw error;
      }

      // Return undefined for 204 No Content
      if (response.status === 204) {
        return undefined as T;
      }

      const data = (await response.json()) as T;
      this.logger.debug(`Successfully parsed response from ${url}`);
      return data;
    } catch (error) {
      // If we have network errors or other transient issues, retry
      if (
        retry &&
        retryCount < this.maxRetries &&
        this.shouldRetry(error as Error, null)
      ) {
        this.logger.warn(
          `Error calling Infisical API, retrying (attempt ${retryCount + 1}/${
            this.maxRetries
          }): ${error}`,
        );
        await new Promise(resolve =>
          setTimeout(resolve, this.retryDelay * Math.pow(2, retryCount)),
        );
        return this.makeRequest<T>(options, retryCount + 1);
      }

      this.logger.error(`Error calling Infisical API at ${url}: ${error}`);
      throw error;
    }
  }

  /**
   * Get all secrets for a workspace
   *
   * @param workspaceId - The Infisical workspace ID
   * @param path - Optional path to filter secrets
   * @param environment - Optional environment to filter secrets
   * @returns A promise resolving to secrets and folders
   * @public
   */
  async getSecrets(
    workspaceId: string,
    path?: string,
    environment?: string,
  ): Promise<{
    secrets: InfisicalSecret[];
    folders: any[];
  }> {
    this.logger.info(
      `Fetching secrets from Infisical (workspace: ${workspaceId}, path: ${
        path || 'root'
      }, env: ${environment || 'default'})`,
    );

    try {
      // Get secrets
      const secretsResponse = await this.makeRequest<InfisicalSecretsResponse>({
        method: 'GET',
        path: '/v3/secrets/raw',
        queryParams: {
          workspaceId,
          environment,
          include_imports: 'true',
          secretPath: path,
          viewSecretValue: 'false',
        },
      });

      // Get folders
      const foldersResponse = await this.makeRequest<InfisicalFoldersResponse>({
        method: 'GET',
        path: '/v1/folders',
        queryParams: {
          workspaceId,
          environment,
          include_imports: 'true',
          path,
        },
      });

      // Process and combine secrets and imported secrets
      const secrets = secretsResponse?.secrets || [];
      const importedSecrets =
        secretsResponse?.imports
          ?.reduce(
            (acc, imp) => acc.concat(imp.secrets),
            [] as InfisicalSecret[],
          )
          .map(s => ({ ...s, readonly: true })) || [];

      this.logger.info(
        `Successfully fetched ${secrets.length} secrets and ${importedSecrets.length} imported secrets`,
      );

      return {
        secrets: [...secrets, ...importedSecrets],
        folders: foldersResponse.folders || [],
      };
    } catch (error) {
      this.logger.error(`Failed to get secrets: ${error}`);
      throw error;
    }
  }

  /**
   * Fetches a specific secret by ID
   * @param workspaceId - ID of the workspace containing the secret
   * @param secretId - ID of the secret to fetch
   * @param options - Optional path and environment
   */
  async getSecretById(
    workspaceId: string,
    secretId: string,
    options?: {
      environment?: string;
      path?: string;
    },
  ): Promise<InfisicalSecret> {
    this.logger.info(
      `Fetching secret ${secretId} from Infisical (workspace: ${workspaceId}, path: ${
        options?.path || 'root'
      }, env: ${options?.environment || 'default'})`,
    );

    const response = await this.makeRequest<InfisicalSecretResponse>({
      method: 'GET',
      path: `/v3/secrets/raw/${secretId}`,
      queryParams: {
        workspaceId,
        environment: options?.environment,
        secretPath: options?.path,
        include_imports: 'true',
      },
    });

    return await response.secret;
  }

  /**
   * Create a new secret
   *
   * @param secretData - Request data for creating a secret
   * @returns A promise resolving to the created secret
   * @public
   */
  async createSecret(
    secretData: InfisicalSecretCreateRequest,
  ): Promise<InfisicalSecret> {
    this.logger.info(
      `Creating secret ${secretData.secretKey} in Infisical (workspace: ${secretData.workspaceId})`,
    );

    try {
      const response = await this.makeRequest<InfisicalSecretResponse>({
        method: 'POST',
        path: `/v3/secrets/raw/${secretData.secretKey}`,
        body: secretData,
      });

      this.logger.info(`Successfully created secret ${secretData.secretKey}`);
      return response.secret;
    } catch (error) {
      this.logger.error(`Failed to create secret ${secretData.secretKey}: ${error}`);
      throw error;
    }
  }

  /**
   * Update an existing secret
   *
   * @param secretData - Request data for updating a secret
   * @returns A promise resolving to the updated secret
   * @public
   */
  async updateSecret(
    secretData: InfisicalSecretUpdateRequest,
    secretId: string,
  ): Promise<InfisicalSecret> {
    this.logger.info(
      `Updating secret ${secretId} in Infisical (workspace: ${secretData.workspaceId})`,
    );

    try {
      const response = await this.makeRequest<InfisicalSecretResponse>({
        method: 'PATCH',
        path: `/v3/secrets/raw/${secretId}`,
        body: {
          ...secretData,
          newSecretName: secretData.secretKey !== secretId ? secretData.secretKey : undefined,
        },
      });

      this.logger.info(`Successfully updated secret ${secretData.secretKey}`);
      return response.secret;
    } catch (error) {
      this.logger.error(`Failed to update secret ${secretData.secretKey}: ${error}`);
      throw error;
    }
  }

  /**
   * Delete a secret
   *
   * @param secretId - ID of the secret to delete
   * @param secretData - Additional data required for deletion
   * @public
   */
  async deleteSecret(
    secretId: string,
    secretData: InfisicalSecretDeleteRequest,
  ): Promise<void> {
    this.logger.info(
      `Deleting secret ${secretId} from Infisical (workspace: ${secretData.workspaceId})`,
    );

    try {
      await this.makeRequest<void>({
        method: 'DELETE',
        path: `/v3/secrets/raw/${secretId}`,
        body: secretData,
      });

      this.logger.info(`Successfully deleted secret ${secretId}`);
    } catch (error) {
      this.logger.error(`Failed to delete secret ${secretId}: ${error}`);
      throw error;
    }
  }

  /**
   * Get all environments for a workspace
   *
   * @param workspaceId - The Infisical workspace ID
   * @returns A promise resolving to project/workspace details
   * @public
   */
  async getEnvironments(workspaceId: string): Promise<InfisicalProject> {
    this.logger.info(
      `Fetching environments from Infisical (workspace: ${workspaceId})`,
    );

    try {
      const projectResponse = await this.makeRequest<{
        workspace: InfisicalProject;
      }>({
        method: 'GET',
        path: `/v1/workspace/${workspaceId}`,
      });

      this.logger.info(
        `Successfully fetched project with ${projectResponse.workspace.environments.length} environments`,
      );
      return projectResponse.workspace;
    } catch (error) {
      this.logger.error(`Failed to get environments: ${error}`);
      throw error;
    }
  }
}
