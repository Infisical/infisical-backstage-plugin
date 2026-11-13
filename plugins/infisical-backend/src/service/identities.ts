import { LoggerService } from '@backstage/backend-plugin-api';
import { parseEntityRef, stringifyEntityRef } from '@backstage/catalog-model';
import { Config } from '@backstage/config';
import { NotFoundError } from '@backstage/errors';
import {
  INFISICAL_FORBIDDEN_REASONS,
  INFISICAL_IDENTITY_ANNOTATION,
} from '@infisical/backstage-plugin-infisical-common';
import { forbiddenError } from './errors';
import { InfisicalApiClient } from './InfisicalApi';

/**
 * A named machine identity configured under `infisical.identities`.
 * @internal
 */
interface NamedIdentity {
  client: InfisicalApiClient;
  /** Normalized entity refs allowed to use this identity, if restricted */
  allowedEntityRefs?: Set<string>;
}

/**
 * Normalizes an entity reference so refs that differ only in case or in an
 * omitted default namespace compare equal.
 */
function normalizeEntityRef(ref: string): string {
  return stringifyEntityRef(parseEntityRef(ref));
}

/**
 * Options for {@link InfisicalIdentityRegistry}.
 * @public
 */
export interface InfisicalIdentityRegistryOptions {
  config: Config;
  logger: LoggerService;
}

/**
 * Holds one Infisical API client per configured machine identity and picks
 * the right one for an entity.
 *
 * The default identity comes from `infisical.authentication`. Named
 * identities come from `infisical.identities.<name>`, each with the same
 * `auth_token` or `universalAuth` block and an optional `allowedEntityRefs`
 * list restricting which entities may use it.
 * @public
 */
export class InfisicalIdentityRegistry {
  private readonly defaultClient?: InfisicalApiClient;
  private readonly identities = new Map<string, NamedIdentity>();

  constructor(options: InfisicalIdentityRegistryOptions) {
    const { config, logger } = options;

    const identitiesConfig = config.getOptionalConfig('infisical.identities');
    for (const name of identitiesConfig?.keys() ?? []) {
      let identityConfig: Config;
      try {
        identityConfig = identitiesConfig!.getConfig(name);
      } catch (error) {
        throw new Error(
          `Invalid Infisical identity name '${name}' in infisical.identities. Use letters and digits, optionally separated by '-' or '_', with each part starting with a letter: ${error}`,
        );
      }
      const allowed = identityConfig.getOptionalStringArray('allowedEntityRefs');
      const allowedEntityRefs =
        allowed &&
        new Set(
          allowed.map(ref => {
            try {
              return normalizeEntityRef(ref);
            } catch {
              throw new Error(
                `Invalid entity ref '${ref}' in infisical.identities.${name}.allowedEntityRefs`,
              );
            }
          }),
        );

      this.identities.set(name, {
        client: new InfisicalApiClient({
          config,
          logger,
          authentication: identityConfig,
          identityName: name,
        }),
        allowedEntityRefs,
      });
    }

    // Without named identities the default identity is mandatory, so keep
    // constructing it to surface the missing-credentials error at startup.
    if (
      config.has('infisical.authentication') ||
      this.identities.size === 0
    ) {
      this.defaultClient = new InfisicalApiClient({ config, logger });
    }

    logger.info(
      `Infisical identities: ${
        this.defaultClient ? 'default' : 'no default'
      }${this.identities.size ? `, ${[...this.identities.keys()].join(', ')}` : ''}`,
    );
  }

  /** Whether the default `infisical.authentication` identity is configured */
  hasDefaultIdentity(): boolean {
    return this.defaultClient !== undefined;
  }

  /**
   * Returns the client for an identity on behalf of an entity.
   *
   * @param identityName - The identity from the entity annotations, or
   *   `undefined` for the default identity
   * @param entityRef - The entity the request is made through
   * @throws NotFoundError when the identity is not configured
   * @throws NotAllowedError when the entity is not in the identity's allowlist
   */
  getClient(
    identityName: string | undefined,
    entityRef: string,
  ): InfisicalApiClient {
    if (identityName === undefined) {
      if (!this.defaultClient) {
        throw new NotFoundError(
          `No Infisical identity is configured for entity '${entityRef}'. Set the ${INFISICAL_IDENTITY_ANNOTATION} annotation or configure infisical.authentication`,
        );
      }
      return this.defaultClient;
    }

    const identity = this.identities.get(identityName);
    if (!identity) {
      throw new NotFoundError(
        `Infisical identity '${identityName}' referenced by entity '${entityRef}' is not configured`,
      );
    }

    if (
      identity.allowedEntityRefs &&
      !identity.allowedEntityRefs.has(normalizeEntityRef(entityRef))
    ) {
      throw forbiddenError(
        INFISICAL_FORBIDDEN_REASONS.identityNotAllowed,
        `Entity '${entityRef}' is not allowed to use Infisical identity '${identityName}'`,
      );
    }

    return identity.client;
  }
}
