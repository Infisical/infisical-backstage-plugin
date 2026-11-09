import { RESOURCE_TYPE_CATALOG_ENTITY } from '@backstage/plugin-catalog-common/alpha';
import {
  infisicalPermissions,
  infisicalSecretCreatePermission,
  infisicalSecretDeletePermission,
  infisicalSecretReadPermission,
  infisicalSecretUpdatePermission,
  infisicalSecretValueReadPermission,
} from './permissions';

describe('infisical permissions', () => {
  it.each([
    [infisicalSecretReadPermission, 'infisical.secret.read', 'read'],
    [infisicalSecretValueReadPermission, 'infisical.secret.value.read', 'read'],
    [infisicalSecretCreatePermission, 'infisical.secret.create', 'create'],
    [infisicalSecretUpdatePermission, 'infisical.secret.update', 'update'],
    [infisicalSecretDeletePermission, 'infisical.secret.delete', 'delete'],
  ])('%#: %s has the expected name and action', (permission, name, action) => {
    expect(permission.name).toBe(name);
    expect(permission.attributes.action).toBe(action);
    expect(permission.resourceType).toBe(RESOURCE_TYPE_CATALOG_ENTITY);
  });

  it('exposes all permissions in infisicalPermissions', () => {
    expect(infisicalPermissions.map(p => p.name)).toEqual([
      'infisical.secret.read',
      'infisical.secret.value.read',
      'infisical.secret.create',
      'infisical.secret.update',
      'infisical.secret.delete',
    ]);
  });
});
