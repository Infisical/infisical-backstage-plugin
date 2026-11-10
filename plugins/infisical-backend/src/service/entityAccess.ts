import { BackstageCredentials } from '@backstage/backend-plugin-api';
import { Entity, parseEntityRef } from '@backstage/catalog-model';
import { InputError, NotAllowedError, NotFoundError } from '@backstage/errors';
import { CatalogService } from '@backstage/plugin-catalog-node';
import {
  INFISICAL_ENVIRONMENT_ANNOTATION,
  INFISICAL_IDENTITY_ANNOTATION,
  INFISICAL_PROJECT_ANNOTATION,
  INFISICAL_SECRET_PATH_ANNOTATION,
  getInfisicalIdentityAnnotation,
} from '@infisical/backstage-plugin-infisical-common';

/**
 * The Infisical coordinates derived from an entity's annotations and the
 * caller's request, after all restrictions have been enforced.
 * @public
 */
export interface ResolvedEntityAccess {
  /** The Infisical project (workspace) ID from `infisical/projectId` */
  workspaceId: string;
  /** The environment to use, if any */
  environment?: string;
  /** The normalized secret path to use */
  path: string;
  /**
   * Name of the machine identity from `infisical.identities` to use, or
   * `undefined` for the default `infisical.authentication` identity
   */
  identity?: string;
}

/**
 * Normalizes a secret path to the form `/a/b` (leading slash, no trailing
 * slash, no empty segments). Rejects traversal attempts.
 * @public
 */
export function normalizeSecretPath(raw: string | undefined): string {
  if (raw === undefined || raw === null) {
    return '/';
  }
  if (typeof raw !== 'string') {
    throw new InputError('path must be a string');
  }
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '/') {
    return '/';
  }
  if (trimmed.includes('\\')) {
    throw new InputError('path must not contain backslashes');
  }
  const segments = trimmed.split('/').filter(segment => segment !== '');
  for (const segment of segments) {
    if (segment === '.' || segment === '..') {
      throw new InputError('path must not contain relative segments');
    }
  }
  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

/**
 * Resolves the secret path a caller may access given the entity's
 * `infisical/secretPath` annotation.
 *
 * - No annotation: any path is allowed, defaulting to `/`.
 * - Annotation without "+": only that exact path is allowed.
 * - Annotation with "+": that path and any subfolder is allowed.
 * @public
 */
export function resolveSecretPath(
  annotation: string | undefined,
  requested: string | undefined,
): string {
  if (!annotation || annotation.trim() === '') {
    return normalizeSecretPath(requested);
  }

  const allowSubfolders = annotation.trim().startsWith('+');
  const basePath = normalizeSecretPath(
    allowSubfolders ? annotation.trim().slice(1) : annotation,
  );

  if (requested === undefined || requested === '') {
    return basePath;
  }

  const requestedPath = normalizeSecretPath(requested);

  if (requestedPath === basePath) {
    return requestedPath;
  }

  if (
    allowSubfolders &&
    (basePath === '/' || requestedPath.startsWith(`${basePath}/`))
  ) {
    return requestedPath;
  }

  throw new NotAllowedError(
    `Access to secret path '${requestedPath}' is not allowed for this entity`,
  );
}

/**
 * Resolves the environment a caller may use given the entity's
 * `infisical/environment` annotation.
 * @public
 */
export function resolveEnvironment(
  annotation: string | undefined,
  requested: string | undefined,
): string | undefined {
  const locked = annotation?.trim();
  if (!locked) {
    return requested || undefined;
  }
  if (requested && requested !== locked) {
    throw new NotAllowedError(
      `Access to environment '${requested}' is not allowed for this entity`,
    );
  }
  return locked;
}

/**
 * Resolves which machine identity an entity uses for a request.
 *
 * - `infisical/identity.<environment>` wins when the request targets that environment.
 * - Otherwise `infisical/identity` is used.
 * - Without either annotation the default identity is used (`undefined`).
 * @public
 */
export function resolveIdentityName(
  annotations: Record<string, string>,
  environment: string | undefined,
): string | undefined {
  const perEnvironment = environment
    ? annotations[getInfisicalIdentityAnnotation(environment)]?.trim()
    : undefined;
  if (perEnvironment) {
    return perEnvironment;
  }
  return annotations[INFISICAL_IDENTITY_ANNOTATION]?.trim() || undefined;
}

/**
 * Validates that a value is a well-formed entity reference.
 * @public
 */
export function validateEntityRef(entityRef: unknown): string {
  if (!entityRef || typeof entityRef !== 'string') {
    throw new InputError('entityRef is required');
  }
  try {
    parseEntityRef(entityRef);
  } catch {
    throw new InputError(`Invalid entityRef '${entityRef}'`);
  }
  return entityRef;
}

/**
 * Options for {@link resolveEntityAccess}.
 * @public
 */
export interface ResolveEntityAccessOptions {
  catalog: CatalogService;
  credentials: BackstageCredentials;
  entityRef: string;
  requestedEnvironment?: string;
  requestedPath?: string;
}

/**
 * Looks up the entity as the caller and derives the Infisical project,
 * environment, path and machine identity from its annotations, enforcing the
 * environment lock and path restrictions.
 * @public
 */
export async function resolveEntityAccess(
  options: ResolveEntityAccessOptions,
): Promise<ResolvedEntityAccess> {
  const {
    catalog,
    credentials,
    entityRef,
    requestedEnvironment,
    requestedPath,
  } = options;

  const entity: Entity | undefined = await catalog.getEntityByRef(entityRef, {
    credentials,
  });

  const annotations = entity?.metadata.annotations ?? {};
  const workspaceId = annotations[INFISICAL_PROJECT_ANNOTATION];

  if (!entity || !workspaceId) {
    throw new NotFoundError(
      `Entity '${entityRef}' was not found or has no ${INFISICAL_PROJECT_ANNOTATION} annotation`,
    );
  }

  const environment = resolveEnvironment(
    annotations[INFISICAL_ENVIRONMENT_ANNOTATION],
    requestedEnvironment,
  );
  const path = resolveSecretPath(
    annotations[INFISICAL_SECRET_PATH_ANNOTATION],
    requestedPath,
  );

  const identity = resolveIdentityName(annotations, environment);

  return { workspaceId, environment, path, identity };
}
