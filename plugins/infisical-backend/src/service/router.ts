import {
  BackstageCredentials,
  HttpAuthService,
  LoggerService,
  PermissionsService,
} from '@backstage/backend-plugin-api';
import express from 'express';
import Router from 'express-promise-router';
import { Config } from '@backstage/config';
import { InputError, NotAllowedError } from '@backstage/errors';
import {
  AuthorizeResult,
  ResourcePermission,
} from '@backstage/plugin-permission-common';
import { CatalogService } from '@backstage/plugin-catalog-node';
import {
  infisicalSecretCreatePermission,
  infisicalSecretDeletePermission,
  infisicalSecretReadPermission,
  infisicalSecretUpdatePermission,
  infisicalSecretValueReadPermission,
} from '@infisical/backstage-plugin-infisical-common';
import { InfisicalApiClient, InfisicalRequestContext } from './InfisicalApi';
import {
  ResolvedEntityAccess,
  resolveEntityAccess,
  validateEntityRef,
} from './entityAccess';
import { InfisicalIdentityRegistry } from './identities';
import {
  InfisicalSecret,
  InfisicalSecretCreateHttpRequest,
  InfisicalSecretDeleteHttpRequest,
  InfisicalSecretUpdateHttpRequest,
} from './types';

/**
 * Options for creating the router.
 * @public
 */
export interface RouterOptions {
  /** Logger instance */
  logger: LoggerService;
  /** Config instance */
  config: Config;
  /** Used to extract the caller's credentials */
  httpAuth: HttpAuthService;
  /** Used to authorize the caller against the entity */
  permissions: PermissionsService;
  /** Used to look up entities and their Infisical annotations */
  catalog: CatalogService;
}

const REDACTED_VALUE = '';

/**
 * Describes the caller for the Infisical audit log, e.g. `user:default/jane`.
 */
function principalRef(credentials: BackstageCredentials): string {
  const principal = credentials.principal as
    | { type?: string; userEntityRef?: string; subject?: string }
    | undefined;
  if (principal?.type === 'user' && principal.userEntityRef) {
    return principal.userEntityRef;
  }
  if (principal?.type === 'service' && principal.subject) {
    return `service:${principal.subject}`;
  }
  return 'anonymous';
}

function queryString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return String(value);
}

/**
 * Reads an optional string field from a JSON body. Other types are rejected
 * so they never reach the access checks or Infisical.
 */
function optionalBodyString(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new InputError(`${name} must be a string`);
  }
  return value;
}

/**
 * Creates a router for the Infisical backend plugin.
 *
 * Every route is scoped to a catalog entity (`entityRef`). The Infisical
 * project, environment, path and machine identity are derived from the
 * entity's annotations and every operation is checked against the permission
 * framework. Requests to Infisical carry the Backstage user and entity in
 * their User-Agent so they can be traced in Infisical's audit log.
 *
 * @param options - The router options
 * @returns An express router
 * @public
 */
export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, config, httpAuth, permissions, catalog } = options;
  const router = Router();

  router.use(express.json());

  const identities = new InfisicalIdentityRegistry({ config, logger });

  /**
   * Evaluates several permissions against the entity in a single
   * permission-backend round trip.
   */
  async function isAllowed(
    requested: ResourcePermission[],
    entityRef: string,
    credentials: BackstageCredentials,
  ): Promise<boolean[]> {
    const decisions = await permissions.authorize(
      requested.map(permission => ({ permission, resourceRef: entityRef })),
      { credentials },
    );
    return requested.map(
      (_, index) => decisions[index]?.result === AuthorizeResult.ALLOW,
    );
  }

  function notAllowed(permission: ResourcePermission, entityRef: string) {
    return new NotAllowedError(
      `Not allowed to perform '${permission.name}' on '${entityRef}'`,
    );
  }

  async function authorize(
    permission: ResourcePermission,
    entityRef: string,
    credentials: BackstageCredentials,
  ): Promise<void> {
    const [allowed] = await isAllowed([permission], entityRef, credentials);
    if (!allowed) {
      throw notAllowed(permission, entityRef);
    }
  }

  /**
   * Validates the entity reference, loads the entity as the caller and
   * resolves the Infisical coordinates from its annotations.
   */
  async function resolveAccess(
    request: express.Request,
    input: {
      entityRef: unknown;
      environment?: string;
      path?: string;
    },
  ) {
    const entityRef = validateEntityRef(input.entityRef);
    const credentials = await httpAuth.credentials(request);
    const access = await resolveEntityAccess({
      catalog,
      credentials,
      entityRef,
      requestedEnvironment: input.environment,
      requestedPath: input.path,
    });
    return { entityRef, credentials, access };
  }

  /**
   * Picks the Infisical client for the entity's machine identity and builds
   * the audit context. Call only after the permission check passed.
   */
  function clientFor(
    access: ResolvedEntityAccess,
    entityRef: string,
    credentials: BackstageCredentials,
  ): { api: InfisicalApiClient; context: InfisicalRequestContext } {
    const api = identities.getClient(access.identity, entityRef);
    return {
      api,
      context: { userRef: principalRef(credentials), entityRef },
    };
  }

  function redactValues(secrets: InfisicalSecret[]): InfisicalSecret[] {
    return secrets.map(secret => {
      const redacted: InfisicalSecret & { secretValue?: string } = {
        ...secret,
        value: REDACTED_VALUE,
      };
      if ('secretValue' in redacted) {
        redacted.secretValue = REDACTED_VALUE;
      }
      return redacted;
    });
  }

  /**
   * GET /secrets - Retrieve secrets and folders for an entity
   *
   * Query parameters:
   *   entityRef - The catalog entity reference (required)
   *   path - The secret path (optional, subject to the entity's secretPath annotation)
   *   environment - The environment slug (optional, subject to the entity's environment annotation)
   *
   * Requires `infisical.secret.read`. Secret values are only included when
   * `infisical.secret.value.read` is also allowed.
   */
  router.get('/secrets', async (request, response) => {
    const { entityRef, credentials, access } = await resolveAccess(request, {
      entityRef: request.query.entityRef,
      environment: queryString(request.query.environment),
      path: queryString(request.query.path),
    });

    const [canRead, canReadValues] = await isAllowed(
      [infisicalSecretReadPermission, infisicalSecretValueReadPermission],
      entityRef,
      credentials,
    );
    if (!canRead) {
      throw notAllowed(infisicalSecretReadPermission, entityRef);
    }

    const { api, context } = clientFor(access, entityRef, credentials);
    const result = await api.getSecrets(
      access.workspaceId,
      access.path === '/' ? undefined : access.path,
      access.environment,
      context,
    );

    response.json({
      ...result,
      secrets: canReadValues ? result.secrets : redactValues(result.secrets),
    });
  });

  /**
   * GET /secrets/:secretId - Retrieve a specific secret, including its value
   *
   * Path parameters:
   *   secretId - The ID (key) of the secret to retrieve
   *
   * Query parameters:
   *   entityRef - The catalog entity reference (required)
   *   path - The secret path (optional)
   *   environment - The environment slug (optional)
   *
   * Requires `infisical.secret.value.read`.
   */
  router.get('/secrets/:secretId', async (request, response) => {
    const { secretId } = request.params;

    if (!secretId || typeof secretId !== 'string') {
      throw new InputError('secretId is required');
    }

    const { entityRef, credentials, access } = await resolveAccess(request, {
      entityRef: request.query.entityRef,
      environment: queryString(request.query.environment),
      path: queryString(request.query.path),
    });

    await authorize(infisicalSecretValueReadPermission, entityRef, credentials);

    const { api, context } = clientFor(access, entityRef, credentials);
    const secret = await api.getSecretById(
      access.workspaceId,
      secretId,
      {
        environment: access.environment,
        path: access.path === '/' ? undefined : access.path,
      },
      context,
    );
    response.json(secret);
  });

  /**
   * GET /environments - Retrieve the environments of the entity's project
   *
   * Query parameters:
   *   entityRef - The catalog entity reference (required)
   *
   * Requires `infisical.secret.read`. When the entity is locked to an
   * environment only that environment is returned.
   */
  router.get('/environments', async (request, response) => {
    const { entityRef, credentials, access } = await resolveAccess(request, {
      entityRef: request.query.entityRef,
    });

    await authorize(infisicalSecretReadPermission, entityRef, credentials);

    const { api, context } = clientFor(access, entityRef, credentials);
    const project = await api.getEnvironments(access.workspaceId, context);

    const environments = access.environment
      ? project.environments.filter(env => env.slug === access.environment)
      : project.environments;

    response.json({ ...project, environments });
  });

  /**
   * POST /secrets - Create a new secret
   *
   * Body:
   *   entityRef - The catalog entity reference (required)
   *   secretKey - The key of the secret (required)
   *   secretValue - The value of the secret (required)
   *   secretComment - Optional comment
   *   secretPath - The path for the secret (optional)
   *   environment - The environment slug (optional)
   *
   * Requires `infisical.secret.create`.
   */
  router.post('/secrets', async (request, response) => {
    const body = (request.body ?? {}) as InfisicalSecretCreateHttpRequest;

    if (!body.secretKey || !body.secretValue) {
      throw new InputError('Key and value are required fields');
    }

    const { entityRef, credentials, access } = await resolveAccess(request, {
      entityRef: body.entityRef,
      environment: optionalBodyString(body.environment, 'environment'),
      path: body.secretPath,
    });

    await authorize(infisicalSecretCreatePermission, entityRef, credentials);

    const { api, context } = clientFor(access, entityRef, credentials);
    const secret = await api.createSecret(
      {
        secretKey: body.secretKey,
        secretValue: body.secretValue,
        secretComment: body.secretComment,
        type: body.type,
        workspaceId: access.workspaceId,
        secretPath: access.path,
        environment: access.environment,
      },
      context,
    );
    response.status(201).json(secret);
  });

  /**
   * PATCH /secrets/:secretId - Update an existing secret
   *
   * Path parameters:
   *   secretId - The ID (key) of the secret to update
   *
   * Body: same as POST /secrets
   *
   * Requires `infisical.secret.update`.
   */
  router.patch('/secrets/:secretId', async (request, response) => {
    const { secretId } = request.params;
    const body = (request.body ?? {}) as InfisicalSecretUpdateHttpRequest;

    if (!secretId) {
      throw new InputError('Secret ID is required');
    }

    if (!body.secretKey || !body.secretValue) {
      throw new InputError('Key and value are required fields');
    }

    const { entityRef, credentials, access } = await resolveAccess(request, {
      entityRef: body.entityRef,
      environment: optionalBodyString(body.environment, 'environment'),
      path: body.secretPath,
    });

    await authorize(infisicalSecretUpdatePermission, entityRef, credentials);

    const { api, context } = clientFor(access, entityRef, credentials);
    const secret = await api.updateSecret(
      {
        secretKey: body.secretKey,
        secretValue: body.secretValue,
        secretComment: body.secretComment,
        type: body.type,
        workspaceId: access.workspaceId,
        secretPath: access.path,
        environment: access.environment,
      },
      secretId,
      context,
    );
    response.json(secret);
  });

  /**
   * DELETE /secrets/:secretId - Delete a secret
   *
   * Path parameters:
   *   secretId - The ID (key) of the secret to delete
   *
   * Body:
   *   entityRef - The catalog entity reference (required)
   *   environment - The environment slug (required unless the entity is locked to one)
   *   secretPath - The secret path (optional)
   *
   * Requires `infisical.secret.delete`.
   */
  router.delete('/secrets/:secretId', async (request, response) => {
    const { secretId } = request.params;
    const body = (request.body ?? {}) as InfisicalSecretDeleteHttpRequest;

    if (!secretId) {
      throw new InputError('Secret ID is required');
    }

    const { entityRef, credentials, access } = await resolveAccess(request, {
      entityRef: body.entityRef,
      environment: optionalBodyString(body.environment, 'environment'),
      path: body.secretPath,
    });

    if (!access.environment) {
      throw new InputError('environment is required');
    }

    await authorize(infisicalSecretDeletePermission, entityRef, credentials);

    const { api, context } = clientFor(access, entityRef, credentials);
    await api.deleteSecret(
      secretId,
      {
        workspaceId: access.workspaceId,
        environment: access.environment,
        secretPath: access.path,
      },
      context,
    );
    response.status(204).send();
  });

  return router;
}
