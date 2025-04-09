/**
 * Types for the Infisical backend plugin.
 */

/**
 * Represents a secret in Infisical.
 * @public
 */
export interface InfisicalSecret {
  /** Unique identifier of the secret */
  id: string;
  /** Key/name of the secret */
  key: string;
  /** Value of the secret */
  value: string;
  /** Type of the secret (e.g., "shared", "personal") */
  type?: string;
  /** Optional comment about the secret */
  comment?: string;
  /** Version number of the secret */
  version?: number;
  /** When the secret was created */
  createdAt?: string;
  /** When the secret was last updated */
  updatedAt?: string;
  /** Whether the secret is read-only (e.g., imported) */
  readonly?: boolean;
}

/**
 * Represents a folder in Infisical.
 * @public
 */
export interface InfisicalFolder {
  /** Unique identifier of the folder */
  id: string;
  /** Name of the folder */
  name: string;
  /** Version number of the folder */
  version: number;
  /** ID of the parent folder */
  parentId: string;
  /** Whether the folder is reserved */
  isReserved: boolean;
  /** Description of the folder */
  description: string;
}

/**
 * Response from Infisical when retrieving a single secret.
 * @public
 */
export interface InfisicalSecretResponse {
  /** The requested secret */
  secret: InfisicalSecret;
}

/**
 * Response from Infisical when retrieving multiple secrets.
 * @public
 */
export interface InfisicalSecretsResponse {
  /** List of secrets */
  secrets: InfisicalSecret[];
  /** List of imported secret collections */
  imports?: Array<{
    /** Secrets from the imported collection */
    secrets: InfisicalSecret[];
  }>;
}

/**
 * Response from Infisical when retrieving folders.
 * @public
 */
export interface InfisicalFoldersResponse {
  /** List of folders */
  folders: InfisicalFolder[];
}

/**
 * Request body for creating a secret.
 * @public
 */
export interface InfisicalSecretCreateRequest {
  /** Key/name of the secret */
  key: string;
  /** Value of the secret */
  value: string;
  /** Type of the secret (e.g., "shared", "personal") */
  type?: string;
  /** Optional comment about the secret */
  comment?: string;
  /** Path where the secret should be stored */
  secretPath?: string;
  /** Workspace ID where the secret belongs */
  workspaceId: string;
  /** Environment where the secret should be available */
  environment?: string;
}

/**
 * Request body for updating a secret.
 * @public
 */
export interface InfisicalSecretUpdateRequest
  extends InfisicalSecretCreateRequest {
  // Same structure as create request currently
}

/**
 * Configuration for Infisical API integration.
 * @public
 */
export interface InfisicalConfig {
  /** Base URL of the Infisical API */
  baseUrl: string;
  /** API token for authentication */
  apiToken: string;
  /** Workspace ID to use by default */
  workspaceId: string;
}

/**
 * Represents an environment in Infisical.
 * @public
 */
export interface InfisicalEnvironment {
  /** Unique identifier of the environment */
  id: string;
  /** Display name of the environment */
  name: string;
  /** URL-friendly identifier for the environment */
  slug: string;
}

/**
 * Represents a project/workspace in Infisical.
 * @public
 */
export interface InfisicalProject {
  /** Unique identifier of the project */
  id: string;
  /** Name of the project */
  name: string;
  /** URL-friendly identifier for the project */
  slug: string;
  /** Available environments in the project */
  environments: InfisicalEnvironment[];
}

/**
 * Response from authentication endpoint.
 * @public
 */
export interface AuthTokenResponse {
  /** JWT access token */
  accessToken: string;
  /** Token expiration time in seconds */
  expiresIn: number;
  /** Maximum token TTL in seconds */
  accessTokenMaxTTL: number;
  /** Type of token, usually "Bearer" */
  tokenType: string;
}

/**
 * Request for deleting a secret.
 * @public
 */
export interface InfisicalSecretDeleteRequest {
  /** Workspace ID where the secret belongs */
  workspaceId: string;
  /** Environment where the secret is available */
  environment: string;
  /** Path where the secret is stored */
  secretPath: string;
}
