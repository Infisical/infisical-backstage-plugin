import { createPermission } from '@backstage/plugin-permission-common';
import { RESOURCE_TYPE_CATALOG_ENTITY } from '@backstage/plugin-catalog-common/alpha';

/**
 * Permission to list secrets, folders and environments of the Infisical
 * project linked to a catalog entity.
 * @public
 */
export const infisicalSecretReadPermission = createPermission({
  name: 'infisical.secret.read',
  attributes: { action: 'read' },
  resourceType: RESOURCE_TYPE_CATALOG_ENTITY,
});

/**
 * Permission to reveal the value of a secret.
 * @public
 */
export const infisicalSecretValueReadPermission = createPermission({
  name: 'infisical.secret.value.read',
  attributes: { action: 'read' },
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
  infisicalSecretReadPermission,
  infisicalSecretValueReadPermission,
  infisicalSecretCreatePermission,
  infisicalSecretUpdatePermission,
  infisicalSecretDeletePermission,
];
