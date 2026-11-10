import {
  AuthService,
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
import {
  ResolvedEntityAccess,
  resolveEntityAccess,
  validateEntityRef,
} from './entityAccess';
import { InfisicalIdentityRegistry } from './identities';
import {
  InfisicalSecret,
  InfisicalSecretCreateHttpRequest,
  InfisicalSecretCreateRequest,
  InfisicalSecretDeleteHttpRequest,
  InfisicalSecretUpdateHttpRequest,
  InfisicalSecretUpdateRequest,
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
  /** Used to identify the caller for the Infisical audit log */
  auth: AuthService;
  /** Used to authorize the caller against the entity */
  permissions: PermissionsService;
  /** Used to look up entities and their Infisical annotations */
  catalog: CatalogService;
}

const REDACTED_VALUE = '';

/** The caller-supplied coordinates every route is scoped by. */
interface EntityScopedInput {
  entityRef: unknown;
  environment?: string;
  path?: string;
}

function redactValue(secret: InfisicalSecret): InfisicalSecret {
  const redacted: InfisicalSecret & { secretValue?: string } = {
    ...secret,
    value: REDACTED_VALUE,
  };
  if ('secretValue' in redacted) {
    redacted.secretValue = REDACTED_VALUE;
  }
  return redacted;
}

function redactValues(secrets: InfisicalSecret[]): InfisicalSecret[] {
  return secrets.map(redactValue);
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

function queryInput(request: express.Request): EntityScopedInput {
  return {
    entityRef: request.query.entityRef,
    environment: queryString(request.query.environment),
    path: queryString(request.query.path),
  };
}

function bodyInput(body: InfisicalSecretDeleteHttpRequest): EntityScopedInput {
  return {
    entityRef: body.entityRef,
    environment: optionalBodyString(body.environment, 'environment'),
    path: body.secretPath,
  };
}

/**
 * Builds the Infisical create/update payload. The project, environment and
 * path come from the resolved entity access, never from the request body.
 * An update without `secretValue` keeps the stored value: the undefined
 * field is dropped when the payload is serialized.
 */
function secretPayload(
  body: InfisicalSecretCreateHttpRequest,
  access: ResolvedEntityAccess,
): InfisicalSecretCreateRequest;
function secretPayload(
  body: InfisicalSecretUpdateHttpRequest,
  access: ResolvedEntityAccess,
): InfisicalSecretUpdateRequest;
function secretPayload(
  body: InfisicalSecretUpdateHttpRequest,
  access: ResolvedEntityAccess,
): InfisicalSecretUpdateRequest {
  return {
    secretKey: body.secretKey,
    secretValue: body.secretValue,
    secretComment: body.secretComment,
    type: body.type,
    workspaceId: access.workspaceId,
    secretPath: access.path,
    environment: access.environment,
  };
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
  const { logger, config, httpAuth, auth, permissions, catalog } = options;
  const router = Router();

  router.use(express.json());

  const identities = new InfisicalIdentityRegistry({ config, logger });

  /**
   * Describes the caller for the Infisical audit log, e.g. `user:default/jane`.
   */
  function principalRef(credentials: BackstageCredentials): string {
    if (auth.isPrincipal(credentials, 'user')) {
      return credentials.principal.userEntityRef;
    }
    if (auth.isPrincipal(credentials, 'service')) {
      return `service:${credentials.principal.subject}`;
    }
    return 'anonymous';
  }

  /**
   * Runs the checks every route shares, always in this order:
   *
   * 1. Validates the entity reference (400).
   * 2. Loads the entity as the caller and resolves the Infisical project,
   *    environment, path and identity from its annotations (404/403/400).
   * 3. Authorizes `permission` against the entity (403). `optional`
   *    permissions are evaluated in the same round trip and returned.
   * 4. Picks the client for the entity's machine identity (404/403). This
   *    runs only after the permission check so that callers without
   *    permission learn nothing about the identity configuration.
   */
  async function entityScoped(
    request: express.Request,
    input: EntityScopedInput,
    permission: ResourcePermission,
    checks: {
      optional?: ResourcePermission[];
      requireEnvironment?: boolean;
    } = {},
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

    if (checks.requireEnvironment && !access.environment) {
      throw new InputError('environment is required');
    }

    const requested = [permission, ...(checks.optional ?? [])];
    const decisions = await permissions.authorize(
      requested.map(p => ({ permission: p, resourceRef: entityRef })),
      { credentials },
    );
    const [allowed, ...optionalAllowed] = requested.map(
      (_, index) => decisions[index]?.result === AuthorizeResult.ALLOW,
    );
    if (!allowed) {
      throw new NotAllowedError(
        `Not allowed to perform '${permission.name}' on '${entityRef}'`,
      );
    }

    return {
      access,
      api: identities.getClient(access.identity, entityRef),
      context: { userRef: principalRef(credentials), entityRef },
      optionalAllowed,
    };
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
    const {
      access,
      api,
      context,
      optionalAllowed: [canReadValues],
    } = await entityScoped(
      request,
      queryInput(request),
      infisicalSecretReadPermission,
      { optional: [infisicalSecretValueReadPermission] },
    );

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
    const { access, api, context } = await entityScoped(
      request,
      queryInput(request),
      infisicalSecretValueReadPermission,
    );

    const secret = await api.getSecretById(
      access.workspaceId,
      request.params.secretId,
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
    const { access, api, context } = await entityScoped(
      request,
      { entityRef: request.query.entityRef },
      infisicalSecretReadPermission,
    );

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

    const { access, api, context } = await entityScoped(
      request,
      bodyInput(body),
      infisicalSecretCreatePermission,
    );

    const secret = await api.createSecret(secretPayload(body, access), context);
    response.status(201).json(secret);
  });

  /**
   * PATCH /secrets/:secretId - Update an existing secret
   *
   * Path parameters:
   *   secretId - The ID (key) of the secret to update
   *
   * Body: same as POST /secrets, except that `secretValue` is optional.
   * Omitting it keeps the current value, so callers who may update but not
   * read values can still rename a secret or change its comment. When it is
   * present it must be a non-empty string.
   *
   * Requires `infisical.secret.update`. The value is only included in the
   * response when `infisical.secret.value.read` is also allowed.
   */
  router.patch('/secrets/:secretId', async (request, response) => {
    const body = (request.body ?? {}) as InfisicalSecretUpdateHttpRequest;

    if (!body.secretKey) {
      throw new InputError('Key is a required field');
    }
    if (
      body.secretValue !== undefined &&
      (typeof body.secretValue !== 'string' || body.secretValue === '')
    ) {
      throw new InputError(
        'Value must be a non-empty string; omit it to keep the current value',
      );
    }

    const {
      access,
      api,
      context,
      optionalAllowed: [canReadValues],
    } = await entityScoped(
      request,
      bodyInput(body),
      infisicalSecretUpdatePermission,
      { optional: [infisicalSecretValueReadPermission] },
    );

    const secret = await api.updateSecret(
      secretPayload(body, access),
      request.params.secretId,
      context,
    );
    // Infisical returns the stored value, which an update without
    // `secretValue` would otherwise reveal
    response.json(canReadValues ? secret : redactValue(secret));
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
    const body = (request.body ?? {}) as InfisicalSecretDeleteHttpRequest;

    const { access, api, context } = await entityScoped(
      request,
      bodyInput(body),
      infisicalSecretDeletePermission,
      { requireEnvironment: true },
    );

    await api.deleteSecret(
      request.params.secretId,
      {
        workspaceId: access.workspaceId,
        environment: access.environment!,
        secretPath: access.path,
      },
      context,
    );
    response.status(204).send();
  });

  return router;
}
