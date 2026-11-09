import {
  INFISICAL_IDENTITY_ANNOTATION,
  getInfisicalIdentityAnnotation,
} from './annotations';

describe('identity annotations', () => {
  it('exposes the default identity annotation', () => {
    expect(INFISICAL_IDENTITY_ANNOTATION).toBe('infisical/identity');
  });

  it('builds the per-environment identity annotation', () => {
    expect(getInfisicalIdentityAnnotation('prod')).toBe(
      'infisical/identity.prod',
    );
  });
});
