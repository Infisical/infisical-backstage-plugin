import { mockServices } from '@backstage/backend-test-utils';
import { ConfigReader } from '@backstage/config';
import { NotAllowedError, NotFoundError } from '@backstage/errors';
import { InfisicalApiClient } from './InfisicalApi';
import { InfisicalIdentityRegistry } from './identities';

const logger = mockServices.rootLogger();
const ENTITY_REF = 'component:default/payments';

function universalAuth(clientId: string) {
  return { universalAuth: { clientId, clientSecret: `${clientId}-secret` } };
}

function registry(infisical: Record<string, unknown>) {
  return new InfisicalIdentityRegistry({
    config: new ConfigReader({
      infisical: { baseUrl: 'https://infisical.example.com', ...infisical },
    }),
    logger,
  });
}

/** Reads the client ID the client authenticates with. */
function clientIdOf(client: InfisicalApiClient): string | undefined {
  return (client as any).credentials.clientId;
}

describe('InfisicalIdentityRegistry', () => {
  it('uses the default identity when no identity is requested', () => {
    const identities = registry({ authentication: universalAuth('default') });

    expect(clientIdOf(identities.getClient(undefined, ENTITY_REF))).toBe(
      'default',
    );
  });

  it('keeps the existing error when no credentials are configured at all', () => {
    expect(() => registry({})).toThrow(
      'Missing Infisical Authentication credentials',
    );
  });

  it('returns a separate client per named identity', () => {
    const identities = registry({
      authentication: universalAuth('default'),
      identities: {
        'payments-dev': universalAuth('dev-id'),
        'payments-prod': { auth_token: { token: 'prod-token' } },
      },
    });

    const dev = identities.getClient('payments-dev', ENTITY_REF);
    const prod = identities.getClient('payments-prod', ENTITY_REF);

    expect(clientIdOf(dev)).toBe('dev-id');
    expect((prod as any).credentials).toEqual({
      type: 'api-token',
      apiToken: 'prod-token',
    });
    expect(identities.getClient('payments-dev', ENTITY_REF)).toBe(dev);
    expect(identities.getClient(undefined, ENTITY_REF)).not.toBe(dev);
  });

  it('allows named identities without a default identity', () => {
    const identities = registry({
      identities: { 'payments-dev': universalAuth('dev-id') },
    });

    expect(clientIdOf(identities.getClient('payments-dev', ENTITY_REF))).toBe(
      'dev-id',
    );
    expect(() => identities.getClient(undefined, ENTITY_REF)).toThrow(
      NotFoundError,
    );
  });

  it('rejects an identity that is not configured', () => {
    const identities = registry({ authentication: universalAuth('default') });

    expect(() => identities.getClient('unknown', ENTITY_REF)).toThrow(
      NotFoundError,
    );
    expect(() => identities.getClient('unknown', ENTITY_REF)).toThrow(
      "Infisical identity 'unknown' referenced by entity 'component:default/payments' is not configured",
    );
  });

  it('throws at startup when a named identity has no credentials', () => {
    expect(() =>
      registry({
        authentication: universalAuth('default'),
        identities: { broken: { allowedEntityRefs: [ENTITY_REF] } },
      }),
    ).toThrow("Missing Infisical Authentication credentials for identity 'broken'");
  });

  it('throws at startup when an allowlist entry is not an entity ref', () => {
    expect(() =>
      registry({
        identities: {
          'payments-dev': {
            ...universalAuth('dev-id'),
            allowedEntityRefs: ['not a ref'],
          },
        },
      }),
    ).toThrow("Invalid entity ref 'not a ref'");
  });

  describe('allowedEntityRefs', () => {
    const identities = registry({
      identities: {
        restricted: {
          ...universalAuth('restricted-id'),
          allowedEntityRefs: ['component:Payments', 'component:team-b/billing'],
        },
        open: universalAuth('open-id'),
      },
    });

    it.each([
      'component:default/payments',
      'Component:default/PAYMENTS',
      'component:payments',
      'component:team-b/billing',
    ])('allows %s', entityRef => {
      expect(clientIdOf(identities.getClient('restricted', entityRef))).toBe(
        'restricted-id',
      );
    });

    it.each(['component:default/other', 'component:default/billing'])(
      'rejects %s',
      entityRef => {
        expect(() => identities.getClient('restricted', entityRef)).toThrow(
          NotAllowedError,
        );
      },
    );

    it('lets any entity use an identity without an allowlist', () => {
      expect(
        clientIdOf(identities.getClient('open', 'component:default/other')),
      ).toBe('open-id');
    });
  });
});
