import { createPermission } from '@backstage/plugin-permission-common';
import { RESOURCE_TYPE_CATALOG_ENTITY } from '@backstage/plugin-catalog-common/alpha';

/**
 * Permission to describe (list) the secrets, folders and environments of the
 * Infisical project linked to a catalog entity. Secret values are not included.
 * @public
 */
export const infisicalSecretDescribePermission = createPermission({
  name: 'infisical.secret.describe',
  attributes: { action: 'read' },
  resourceType: RESOURCE_TYPE_CATALOG_ENTITY,
});

/**
 * Permission to reveal the value of a secret.
 *
 * It deliberately has no `action` attribute, so policies and roles that allow
 * every `read` on catalog entities do not reveal secret values. It has to be
 * granted by name.
 * @public
 */
export const infisicalSecretValueReadPermission = createPermission({
  name: 'infisical.secret.value.read',
  attributes: {},
  resourceType: RESOURCE_TYPE_CATALOG_ENTITY,
});

/**
 * Permission to create a secret.
 * @public
 */
export const infisicalSecretCreatePermission = createPermission({
  name: 'infisical.secret.create',
  attributes: { action: 'create' },
  resourceType: RESOURCE_TYPE_CATALOG_ENTITY,
});

/**
 * Permission to update a secret.
 * @public
 */
export const infisicalSecretUpdatePermission = createPermission({
  name: 'infisical.secret.update',
  attributes: { action: 'update' },
  resourceType: RESOURCE_TYPE_CATALOG_ENTITY,
});

/**
 * Permission to delete a secret.
 * @public
 */
export const infisicalSecretDeletePermission = createPermission({
  name: 'infisical.secret.delete',
  attributes: { action: 'delete' },
  resourceType: RESOURCE_TYPE_CATALOG_ENTITY,
});

/**
 * All permissions exposed by the Infisical plugin.
 * @public
 */
export const infisicalPermissions = [
  infisicalSecretDescribePermission,
  infisicalSecretValueReadPermission,
  infisicalSecretCreatePermission,
  infisicalSecretUpdatePermission,
  infisicalSecretDeletePermission,
];
