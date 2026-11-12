import { mockCredentials } from '@backstage/backend-test-utils';
import { InputError, NotAllowedError, NotFoundError } from '@backstage/errors';
import { CatalogService } from '@backstage/plugin-catalog-node';
import { normalizeSecretPath } from '@infisical/backstage-plugin-infisical-common';
import {
  resolveEntityAccess,
  resolveEnvironment,
  resolveIdentityName,
  resolveSecretPath,
  validateEntityRef,
} from './entityAccess';

describe('resolveSecretPath', () => {
  describe('without annotation', () => {
    it('defaults to root', () => {
      expect(resolveSecretPath(undefined, undefined)).toBe('/');
    });

    it('allows any path', () => {
      expect(resolveSecretPath(undefined, '/any/where')).toBe('/any/where');
    });
  });

  describe('without "+" prefix', () => {
    it('defaults to the annotated path', () => {
      expect(resolveSecretPath('/api', undefined)).toBe('/api');
      expect(resolveSecretPath('/api', '')).toBe('/api');
    });

    it.each(['/api', 'api', '/api/', '//api'])(
      'allows exact path %p',
      input => {
        expect(resolveSecretPath('/api', input)).toBe('/api');
      },
    );

    it.each(['/api/sub', '/other', '/', '/API', '/apix'])(
      'rejects %p',
      input => {
        expect(() => resolveSecretPath('/api', input)).toThrow(NotAllowedError);
      },
    );
  });

  describe('with "+" prefix', () => {
    it('defaults to the annotated path', () => {
      expect(resolveSecretPath('+/api', undefined)).toBe('/api');
    });

    it.each(['/api', '/api/sub', '/api/sub/deeper'])('allows %p', input => {
      expect(resolveSecretPath('+/api', input)).toBe(
        normalizeSecretPath(input),
      );
    });

    it.each(['/other', '/', '/apix', '/API'])('rejects %p', input => {
      expect(() => resolveSecretPath('+/api', input)).toThrow(NotAllowedError);
    });

    it('allows everything when the annotation is "+/"', () => {
      expect(resolveSecretPath('+/', '/any/where')).toBe('/any/where');
      expect(resolveSecretPath('+/', undefined)).toBe('/');
    });

    it('rejects traversal attempts with an InputError', () => {
      expect(() => resolveSecretPath('+/api', '/api/../other')).toThrow(
        InputError,
      );
    });
  });
});

describe('resolveEnvironment', () => {
  it('returns the requested environment when not locked', () => {
    expect(resolveEnvironment(undefined, 'dev')).toBe('dev');
    expect(resolveEnvironment(undefined, undefined)).toBeUndefined();
    expect(resolveEnvironment('', '')).toBeUndefined();
  });

  it('returns the locked environment when none is requested', () => {
    expect(resolveEnvironment('staging', undefined)).toBe('staging');
    expect(resolveEnvironment('staging', '')).toBe('staging');
  });

  it('allows requesting the locked environment', () => {
    expect(resolveEnvironment('staging', 'staging')).toBe('staging');
  });

  it('rejects a different environment', () => {
    expect(() => resolveEnvironment('staging', 'production')).toThrow(
      NotAllowedError,
    );
  });

  it('trims the requested environment', () => {
    expect(resolveEnvironment(undefined, ' prod ')).toBe('prod');
    expect(resolveEnvironment(undefined, '  ')).toBeUndefined();
    expect(resolveEnvironment('staging', ' staging')).toBe('staging');
    expect(resolveEnvironment('staging', '  ')).toBe('staging');
    expect(() => resolveEnvironment('staging', ' production ')).toThrow(
      NotAllowedError,
    );
  });

  it('marks a rejected environment as an entity restriction', () => {
    expect(() => resolveEnvironment('staging', 'production')).toThrow(
      expect.objectContaining({ reason: 'entity-restriction' }),
    );
  });
});

describe('validateEntityRef', () => {
  it('accepts a valid entity ref', () => {
    expect(validateEntityRef('component:default/foo')).toBe(
      'component:default/foo',
    );
  });

  it.each([undefined, '', 42, 'not a ref', ':/'])('rejects %p', input => {
    expect(() => validateEntityRef(input)).toThrow(InputError);
  });
});

describe('resolveIdentityName', () => {
  it('returns undefined without identity annotations', () => {
    expect(resolveIdentityName({}, 'dev')).toBeUndefined();
    expect(resolveIdentityName({}, undefined)).toBeUndefined();
  });

  it('returns the default identity annotation', () => {
    const annotations = { 'infisical/identity': 'team-a' };
    expect(resolveIdentityName(annotations, 'dev')).toBe('team-a');
    expect(resolveIdentityName(annotations, undefined)).toBe('team-a');
  });

  it('prefers the per-environment identity for that environment', () => {
    const annotations = {
      'infisical/identity': 'team-a',
      'infisical/identity.prod': 'team-a-prod',
    };
    expect(resolveIdentityName(annotations, 'prod')).toBe('team-a-prod');
    expect(resolveIdentityName(annotations, 'dev')).toBe('team-a');
    expect(resolveIdentityName(annotations, undefined)).toBe('team-a');
  });

  it('falls back to the default identity when only other environments are overridden', () => {
    const annotations = { 'infisical/identity.prod': 'team-a-prod' };
    expect(resolveIdentityName(annotations, 'prod')).toBe('team-a-prod');
    expect(resolveIdentityName(annotations, 'dev')).toBeUndefined();
  });

  it('ignores blank annotations', () => {
    const annotations = {
      'infisical/identity': ' ',
      'infisical/identity.prod': '',
    };
    expect(resolveIdentityName(annotations, 'prod')).toBeUndefined();
  });
});

describe('resolveEntityAccess', () => {
  const credentials = mockCredentials.user();
  const getEntityByRef = jest.fn();
  const catalog = { getEntityByRef } as unknown as CatalogService;

  beforeEach(() => {
    getEntityByRef.mockReset();
  });

  it('derives the workspace, environment and path from annotations', async () => {
    getEntityByRef.mockResolvedValue({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'foo',
        annotations: {
          'infisical/projectId': 'project-1',
          'infisical/environment': 'staging',
          'infisical/secretPath': '+/api',
        },
      },
    });

    await expect(
      resolveEntityAccess({
        catalog,
        credentials,
        entityRef: 'component:default/foo',
        requestedPath: '/api/sub',
      }),
    ).resolves.toEqual({
      workspaceId: 'project-1',
      environment: 'staging',
      path: '/api/sub',
    });

    expect(getEntityByRef).toHaveBeenCalledWith('component:default/foo', {
      credentials,
    });
  });

  it('resolves the identity for the locked environment', async () => {
    getEntityByRef.mockResolvedValue({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'foo',
        annotations: {
          'infisical/projectId': 'project-1',
          'infisical/environment': 'prod',
          'infisical/identity': 'team-a',
          'infisical/identity.prod': 'team-a-prod',
        },
      },
    });

    await expect(
      resolveEntityAccess({
        catalog,
        credentials,
        entityRef: 'component:default/foo',
      }),
    ).resolves.toEqual({
      workspaceId: 'project-1',
      environment: 'prod',
      path: '/',
      identity: 'team-a-prod',
    });
  });

  it('resolves the identity for the requested environment', async () => {
    getEntityByRef.mockResolvedValue({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'foo',
        annotations: {
          'infisical/projectId': 'project-1',
          'infisical/identity': 'team-a',
          'infisical/identity.prod': 'team-a-prod',
        },
      },
    });

    await expect(
      resolveEntityAccess({
        catalog,
        credentials,
        entityRef: 'component:default/foo',
        requestedEnvironment: 'dev',
      }),
    ).resolves.toMatchObject({ environment: 'dev', identity: 'team-a' });
  });

  it('does not let a padded environment miss its identity override', async () => {
    getEntityByRef.mockResolvedValue({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'foo',
        annotations: {
          'infisical/projectId': 'project-1',
          'infisical/identity': 'team-a',
          'infisical/identity.prod': 'team-a-prod',
        },
      },
    });

    await expect(
      resolveEntityAccess({
        catalog,
        credentials,
        entityRef: 'component:default/foo',
        requestedEnvironment: ' prod',
      }),
    ).resolves.toMatchObject({ environment: 'prod', identity: 'team-a-prod' });
  });

  it('throws NotFoundError when the entity does not exist', async () => {
    getEntityByRef.mockResolvedValue(undefined);

    await expect(
      resolveEntityAccess({
        catalog,
        credentials,
        entityRef: 'component:default/missing',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError when the project annotation is missing', async () => {
    getEntityByRef.mockResolvedValue({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: { name: 'foo' },
    });

    await expect(
      resolveEntityAccess({
        catalog,
        credentials,
        entityRef: 'component:default/foo',
      }),
    ).rejects.toThrow(NotFoundError);
  });
});
