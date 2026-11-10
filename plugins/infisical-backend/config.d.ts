/**
 * Authentication block for an Infisical machine identity. Configure either
 * `auth_token` or `universalAuth`.
 */
interface InfisicalAuthentication {
  /** Static access token */
  auth_token?: {
    /**
     * Infisical access token
     * @visibility secret
     */
    token: string;
  };
  /** Universal Auth (client credentials) */
  universalAuth?: {
    /** Universal Auth client ID */
    clientId: string;
    /**
     * Universal Auth client secret
     * @visibility secret
     */
    clientSecret: string;
  };
}

export interface Config {
  /** Configuration for the Infisical backend plugin */
  infisical?: {
    /**
     * Base URL of the Infisical instance
     * @default https://app.infisical.com
     */
    baseUrl?: string;

    /**
     * Default machine identity, used by entities without an
     * `infisical/identity` annotation. Optional when `identities` is set.
     */
    authentication?: InfisicalAuthentication;

    /**
     * Named machine identities that entities can select with the
     * `infisical/identity` and `infisical/identity.<environment>` annotations.
     * Each identity appears as its own actor in the Infisical audit log.
     */
    identities?: {
      [name: string]: InfisicalAuthentication & {
        /**
         * Entity refs allowed to use this identity, for example
         * `component:default/payments`. When omitted, any entity may use it.
         */
        allowedEntityRefs?: string[];
      };
    };
  };
}
