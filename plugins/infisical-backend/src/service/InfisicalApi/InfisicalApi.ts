import {
  NotFoundError,
  ConflictError,
  InputError,
  ServiceUnavailableError,
} from '@backstage/errors';
import { Config } from '@backstage/config';
import { LoggerService } from '@backstage/backend-plugin-api';
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
import { INFISICAL_FORBIDDEN_REASONS } from '@infisical/backstage-plugin-infisical-common';
import { forbiddenError } from '../errors';

/** How long before its expiry an access token is refreshed */
const TOKEN_EXPIRY_MARGIN_SECONDS = 300;

/**
 * Share of the lifetime used as the margin instead, for tokens that do not
 * live longer than {@link TOKEN_EXPIRY_MARGIN_SECONDS}
 */
const TOKEN_EXPIRY_MARGIN_RATIO = 0.2;

/**
 * Encodes a value for use as a single URL path segment.
 *
 * `encodeURIComponent` leaves dots alone and `new URL()` resolves `.` and `..`
 * segments, so those are rejected instead of being allowed to change the
 * endpoint that is called.
 */
function pathSegment(value: string): string {
  if (
    typeof value !== 'string' ||
    value === '' ||
    value === '.' ||
    value === '..'
  ) {
    throw new InputError(`Invalid path segment '${value}'`);
  }
  return encodeURIComponent(value);
}

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
  /** Who and what the request is made for, sent in the User-Agent header */
  context?: InfisicalRequestContext;
}

/**
 * Describes who triggered an Infisical request from Backstage. It is sent in
 * the `User-Agent` header, which Infisical stores in its audit log.
 * @public
 */
export interface InfisicalRequestContext {
  /** The Backstage user, e.g. `user:default/jane` */
  userRef?: string;
  /** The catalog entity the secrets are accessed through */
  entityRef?: string;
}

/**
 * Product token used as the `User-Agent` for every Infisical request.
 * @public
 */
export const INFISICAL_USER_AGENT = 'backstage-plugin-infisical';

/**
 * Builds the `User-Agent` header for an Infisical request, for example
 * `backstage-plugin-infisical (user=user:default/jane; entity=component:default/api)`.
 * Characters outside printable ASCII are dropped so the header is always valid.
 * @public
 */
export function buildUserAgent(context?: InfisicalRequestContext): string {
  const sanitize = (value: string) =>
    value.replace(/[^\x20-\x7E]/g, '').replace(/[();]/g, '').trim();

  const parts: string[] = [];
  if (context?.userRef) {
    parts.push(`user=${sanitize(context.userRef)}`);
  }
  if (context?.entityRef) {
    parts.push(`entity=${sanitize(context.entityRef)}`);
  }

  return parts.length > 0
    ? `${INFISICAL_USER_AGENT} (${parts.join('; ')})`
    : INFISICAL_USER_AGENT;
}

/**
 * Options for creating an Infisical API client
 * @public
 */
export interface InfisicalApiClientOptions {
  /** Configuration */
  config: Config;
  /** Logger instance */
  logger: LoggerService;
  /**
   * The authentication block to use (containing `auth_token` or
   * `universalAuth`). Defaults to `infisical.authentication`.
   */
  authentication?: Config;
  /** Name of the machine identity from `infisical.identities`, if any */
  identityName?: string;
}

/**
 * Client for interacting with the Infisical API
 * @public
 */
export class InfisicalApiClient {
  private readonly baseUrl: string;
  private readonly logger: LoggerService;
  private credentials: AuthCredentials;
  /** The in-flight login, shared by concurrent requests */
  private tokenRefresh?: Promise<void>;
  private maxRetries: number = 3;
  private retryDelay: number = 1000; // 1 second initial delay
  private retryStatusCodes: number[] = [408, 429, 500, 502, 503, 504];

  /**
   * Create a new Infisical API client
   */
  constructor(options: InfisicalApiClientOptions) {
    const { config, logger, authentication, identityName } = options;

    this.logger = logger.child({
      service: 'InfisicalApiClient',
      identity: identityName ?? 'default',
    });

    try {
      this.baseUrl = this.getBaseUrlFromConfig(config);
      this.credentials = this.getCredentialsFromConfig(
        authentication ?? config.getOptionalConfig('infisical.authentication'),
        identityName,
      );

      this.logger.info(
        `Initialized Infisical API client for identity '${
          identityName ?? 'default'
        }' with base URL: ${this.baseUrl}`,
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
  private getCredentialsFromConfig(
    authConfig: Config | undefined,
    identityName?: string,
  ): AuthCredentials {
    try {
      // Check for API token auth
      if (authConfig?.has('auth_token')) {
        return {
          type: 'api-token',
          apiToken: authConfig.getString('auth_token.token'),
        };
      }

      // Check for client credentials auth
      if (authConfig?.has('universalAuth')) {
        return {
          type: 'client-credentials',
          clientId: authConfig.getString('universalAuth.clientId'),
          clientSecret: authConfig.getString('universalAuth.clientSecret'),
        };
      }

      // No valid auth methods found
      throw new Error(
        identityName
          ? `Missing Infisical Authentication credentials for identity '${identityName}'. Configure either auth_token or universalAuth on your infisical.identities.${identityName} settings.`
          : 'Missing Infisical Authentication credentials. Configure either auth_token or universalAuth on your infisical.authentication settings.',
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
    try {
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
          'User-Agent': buildUserAgent(),
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

      // Refresh the token a little before it expires. The margin is 5 minutes,
      // unless the token does not live longer than that: then the fixed margin
      // would make it expire on arrival and every request would log in again,
      // so a share of its lifetime is used instead.
      const expiresInSeconds = tokenData.expiresIn;
      const marginSeconds =
        expiresInSeconds > TOKEN_EXPIRY_MARGIN_SECONDS
          ? TOKEN_EXPIRY_MARGIN_SECONDS
          : expiresInSeconds * TOKEN_EXPIRY_MARGIN_RATIO;
      const expiresInMs = (expiresInSeconds - marginSeconds) * 1000;

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
      if (!this.tokenRefresh) {
        this.logger.info('Access token expired or not present, refreshing...');
        this.tokenRefresh = this.authenticateWithClientCredentials().finally(
          () => {
            this.tokenRefresh = undefined;
          },
        );
      }
      await this.tokenRefresh;
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
   * Turn a failed Infisical response into an error whose type decides the
   * status code Backstage answers with.
   * @internal
   */
  private async parseErrorResponse(response: Response): Promise<Error> {
    let detail = 'Failed to parse error response';
    try {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const errorData = (await response.json()) as ErrorResponse;
        detail = errorData?.message || 'Unknown error';
      } else {
        detail = (await response.text()) || 'Unknown error';
      }
    } catch {
      // Keep the fallback detail
    }

    const { status } = response;
    const message = `Infisical API error (${status}): ${detail}`;

    switch (status) {
      case 400:
      case 422:
        return new InputError(message);
      case 403:
        return forbiddenError(
          INFISICAL_FORBIDDEN_REASONS.infisicalForbidden,
          message,
        );
      case 404:
        return new NotFoundError(message);
      case 409:
        return new ConflictError(message);
      case 408:
      case 429:
        return new ServiceUnavailableError(message);
      default:
        // A 401 means the machine identity credentials are wrong. That is a
        // server-side misconfiguration, not an expired Backstage session, so
        // it is not forwarded as 401.
        return status >= 500
          ? new ServiceUnavailableError(message)
          : new Error(message);
    }
  }

  /**
   * Check if a failed response should be retried. Reads are retried on any
   * transient status. Writes are only retried when Infisical rate limited the
   * request, because any other failure may have been applied already.
   * @internal
   */
  private shouldRetryStatus(method: string, statusCode: number): boolean {
    if (method.toUpperCase() === 'GET') {
      return this.retryStatusCodes.includes(statusCode);
    }
    return statusCode === 429;
  }

  /**
   * Wait before the next attempt, doubling the delay each time
   * @internal
   */
  private async backoff(retryCount: number): Promise<void> {
    await new Promise(resolve =>
      setTimeout(resolve, this.retryDelay * Math.pow(2, retryCount)),
    );
  }

  /**
   * Make an API request with automatic retry and token refresh
   * @internal
   */
  private async makeRequest<T>(
    options: RequestOptions,
    retryCount: number = 0,
    tokenRefreshed: boolean = false,
  ): Promise<T> {
    const { method, path, body, queryParams, context } = options;
    const url = this.buildUrl(path, queryParams);
    const retry = options.retry !== false;
    const canRetry = retry && retryCount < this.maxRetries;

    this.logger.debug(`Making ${method} request to ${url}`);

    let response: Response;
    try {
      // Refreshes the access token first when it has expired
      const authHeader = await this.getAuthorizationHeader();

      response = await fetch(url, {
        method,
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': buildUserAgent(context),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      // fetch rejects with a TypeError when the request never got a response.
      // Only reads are retried: a write may have reached Infisical.
      const isNetworkError = (error as Error)?.name === 'TypeError';
      if (canRetry && isNetworkError && method.toUpperCase() === 'GET') {
        this.logger.warn(
          `Error calling Infisical API, retrying (attempt ${retryCount + 1}/${
            this.maxRetries
          }): ${error}`,
        );
        await this.backoff(retryCount);
        return this.makeRequest<T>(options, retryCount + 1, tokenRefreshed);
      }

      this.logger.error(`Error calling Infisical API at ${url}: ${error}`);
      throw error;
    }

    this.logger.debug(
      `Received response with status ${response.status} from ${url}`,
    );

    // A 401 can mean the access token was revoked or expired early. Log in
    // again once; a second 401 will not fix itself.
    if (
      response.status === 401 &&
      this.credentials.type === 'client-credentials' &&
      retry &&
      !tokenRefreshed
    ) {
      this.logger.warn(
        'Received 401 Unauthorized, refreshing token and retrying once',
      );
      this.credentials.tokenExpiresAt = 0;
      return this.makeRequest<T>(options, retryCount, true);
    }

    if (!response.ok) {
      const error = await this.parseErrorResponse(response);

      if (canRetry && this.shouldRetryStatus(method, response.status)) {
        this.logger.warn(
          `Request failed with status ${response.status}, retrying (attempt ${
            retryCount + 1
          }/${this.maxRetries})`,
        );
        await this.backoff(retryCount);
        return this.makeRequest<T>(options, retryCount + 1, tokenRefreshed);
      }

      this.logger.error(`Error calling Infisical API at ${url}: ${error}`);
      throw error;
    }

    // Return undefined for 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    try {
      const data = (await response.json()) as T;
      this.logger.debug(`Successfully parsed response from ${url}`);
      return data;
    } catch (error) {
      // fetch resolves once the headers arrive, so the connection can still
      // drop while the body is read. Only reads are retried: a write has
      // already been applied.
      if (canRetry && method.toUpperCase() === 'GET') {
        this.logger.warn(
          `Error reading Infisical API response, retrying (attempt ${
            retryCount + 1
          }/${this.maxRetries}): ${error}`,
        );
        await this.backoff(retryCount);
        return this.makeRequest<T>(options, retryCount + 1, tokenRefreshed);
      }

      this.logger.error(
        `Error reading Infisical API response from ${url}: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Get all secrets for a workspace
   *
   * @param workspaceId - The Infisical workspace ID
   * @param path - Optional path to filter secrets
   * @param environment - Optional environment to filter secrets
   * @param context - Who the request is made for (sent as User-Agent)
   * @returns A promise resolving to secrets and folders
   * @public
   */
  async getSecrets(
    workspaceId: string,
    path?: string,
    environment?: string,
    context?: InfisicalRequestContext,
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
      const [secretsResponse, foldersResponse] = await Promise.all([
        this.makeRequest<InfisicalSecretsResponse>({
          method: 'GET',
          path: '/v3/secrets/raw',
          queryParams: {
            workspaceId,
            environment,
            include_imports: 'true',
            secretPath: path,
            viewSecretValue: 'false',
          },
          context,
        }),
        this.makeRequest<InfisicalFoldersResponse>({
          method: 'GET',
          path: '/v1/folders',
          queryParams: {
            workspaceId,
            environment,
            include_imports: 'true',
            path,
          },
          context,
        }),
      ]);

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
   * @param context - Who the request is made for (sent as User-Agent)
   */
  async getSecretById(
    workspaceId: string,
    secretId: string,
    options?: {
      environment?: string;
      path?: string;
    },
    context?: InfisicalRequestContext,
  ): Promise<InfisicalSecret> {
    this.logger.info(
      `Fetching secret ${secretId} from Infisical (workspace: ${workspaceId}, path: ${
        options?.path || 'root'
      }, env: ${options?.environment || 'default'})`,
    );

    const response = await this.makeRequest<InfisicalSecretResponse>({
      method: 'GET',
      path: `/v3/secrets/raw/${pathSegment(secretId)}`,
      queryParams: {
        workspaceId,
        environment: options?.environment,
        secretPath: options?.path,
        include_imports: 'true',
      },
      context,
    });

    return await response.secret;
  }

  /**
   * Create a new secret
   *
   * @param secretData - Request data for creating a secret
   * @param context - Who the request is made for (sent as User-Agent)
   * @returns A promise resolving to the created secret
   * @public
   */
  async createSecret(
    secretData: InfisicalSecretCreateRequest,
    context?: InfisicalRequestContext,
  ): Promise<InfisicalSecret> {
    this.logger.info(
      `Creating secret ${secretData.secretKey} in Infisical (workspace: ${secretData.workspaceId})`,
    );

    try {
      const response = await this.makeRequest<InfisicalSecretResponse>({
        method: 'POST',
        path: `/v3/secrets/raw/${pathSegment(secretData.secretKey)}`,
        body: secretData,
        context,
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
   * @param secretId - ID (key) of the secret to update
   * @param context - Who the request is made for (sent as User-Agent)
   * @returns A promise resolving to the updated secret
   * @public
   */
  async updateSecret(
    secretData: InfisicalSecretUpdateRequest,
    secretId: string,
    context?: InfisicalRequestContext,
  ): Promise<InfisicalSecret> {
    this.logger.info(
      `Updating secret ${secretId} in Infisical (workspace: ${secretData.workspaceId})`,
    );

    try {
      const response = await this.makeRequest<InfisicalSecretResponse>({
        method: 'PATCH',
        path: `/v3/secrets/raw/${pathSegment(secretId)}`,
        body: {
          ...secretData,
          newSecretName: secretData.secretKey !== secretId ? secretData.secretKey : undefined,
        },
        context,
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
   * @param context - Who the request is made for (sent as User-Agent)
   * @public
   */
  async deleteSecret(
    secretId: string,
    secretData: InfisicalSecretDeleteRequest,
    context?: InfisicalRequestContext,
  ): Promise<void> {
    this.logger.info(
      `Deleting secret ${secretId} from Infisical (workspace: ${secretData.workspaceId})`,
    );

    try {
      await this.makeRequest<void>({
        method: 'DELETE',
        path: `/v3/secrets/raw/${pathSegment(secretId)}`,
        body: secretData,
        context,
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
   * @param context - Who the request is made for (sent as User-Agent)
   * @returns A promise resolving to project/workspace details
   * @public
   */
  async getEnvironments(
    workspaceId: string,
    context?: InfisicalRequestContext,
  ): Promise<InfisicalProject> {
    this.logger.info(
      `Fetching environments from Infisical (workspace: ${workspaceId})`,
    );

    try {
      const projectResponse = await this.makeRequest<{
        workspace: InfisicalProject;
      }>({
        method: 'GET',
        path: `/v1/workspace/${pathSegment(workspaceId)}`,
        context,
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
