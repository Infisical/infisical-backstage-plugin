/**
 * Annotation key for the Infisical project ID an entity is linked to.
 * @public
 */
export const INFISICAL_PROJECT_ANNOTATION = 'infisical/projectId';

/**
 * Annotation key that locks an entity to a single Infisical environment.
 * @public
 */
export const INFISICAL_ENVIRONMENT_ANNOTATION = 'infisical/environment';

/**
 * Annotation key for the secret path an entity is restricted to.
 *
 * Without a "+" prefix only the exact path is accessible. With a "+" prefix
 * the path and all of its subfolders are accessible.
 * @public
 */
export const INFISICAL_SECRET_PATH_ANNOTATION = 'infisical/secretPath';

/**
 * Annotation key for the name of the machine identity (configured under
 * `infisical.identities` in app-config) used to access the entity's secrets.
 *
 * When omitted, the default `infisical.authentication` identity is used.
 * @public
 */
export const INFISICAL_IDENTITY_ANNOTATION = 'infisical/identity';

/**
 * Returns the annotation key that overrides the machine identity for a single
 * environment, for example `infisical/identity.prod`.
 *
 * @param environment - The Infisical environment slug
 * @public
 */
export function getInfisicalIdentityAnnotation(environment: string): string {
  return `${INFISICAL_IDENTITY_ANNOTATION}.${environment}`;
}
