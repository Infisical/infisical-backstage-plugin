import { NotAllowedError } from '@backstage/errors';
import { InfisicalForbiddenReason } from '@infisical/backstage-plugin-infisical-common';

/**
 * Builds the error for a 403 response. The `reason` ends up in the error
 * response body (`error.reason`), which lets the frontend tell a missing
 * Backstage permission apart from a configuration problem.
 *
 * This is a plain `NotAllowedError` with an extra field rather than a
 * subclass, because the error name is what maps it to the 403 status.
 */
export function forbiddenError(
  reason: InfisicalForbiddenReason,
  message: string,
): NotAllowedError {
  return Object.assign(new NotAllowedError(message), { reason });
}
