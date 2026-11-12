/**
 * Why the backend answered a request with 403. It is sent as `error.reason`
 * in the error response body so the frontend can tell a missing Backstage
 * permission apart from a configuration problem.
 * @public
 */
export const INFISICAL_FORBIDDEN_REASONS = {
  /** The Backstage permission policy denied the operation */
  permissionDenied: 'permission-denied',
  /** The entity's environment or secretPath annotation does not allow the request */
  entityRestriction: 'entity-restriction',
  /** The entity is not in the allowedEntityRefs of its machine identity */
  identityNotAllowed: 'identity-not-allowed',
  /** Infisical itself denied the machine identity */
  infisicalForbidden: 'infisical-forbidden',
} as const;

/**
 * One of the values of {@link INFISICAL_FORBIDDEN_REASONS}.
 * @public
 */
export type InfisicalForbiddenReason =
  (typeof INFISICAL_FORBIDDEN_REASONS)[keyof typeof INFISICAL_FORBIDDEN_REASONS];
