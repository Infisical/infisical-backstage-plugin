/**
 * Type definitions for the Infisical plugin
 */

/**
 * Represents a secret stored in Infisical
 */
export interface InfisicalSecret {
  /** Unique identifier for the secret */
  id: string;
  /** Secret key name */
  key: string;
  /** Secret key name (duplicate field) */
  secretKey: string;
  /** Secret value */
  value: string;
  /** Secret value (duplicate field) */
  secretValue: string;
  /** Type of the secret */
  type: string;
  /** Optional comment for the secret */
  comment?: string;
  /** Optional comment for the secret (duplicate field) */
  secretComment?: string;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
  /** Whether the secret is read-only */
  readonly: boolean;
}

/**
 * Represents a folder in Infisical
 */
export interface InfisicalFolder {
  /** Unique identifier for the folder */
  id: string;
  /** Folder name */
  name: string;
  /** Full folder path */
  path: string;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
}

/**
 * Represents an environment in Infisical
 */
export interface InfisicalEnvironment {
  /** Unique identifier for the environment */
  id: string;
  /** Environment name */
  name: string;
  /** Environment slug (used in API calls) */
  slug: string;
}

/**
 * Represents a workspace in Infisical
 */
export interface InfisicalWorkspace {
  /** Unique identifier for the workspace */
  id: string;
  /** Workspace name */
  name: string;
}

/**
 * Form values for creating or updating a secret
 */
export interface InfisicalSecretFormValues {
  /** Secret key name */
  secretKey: string;
  /** Secret value */
  secretValue: string;
  /** Optional comment for the secret */
  secretComment?: string;
}
