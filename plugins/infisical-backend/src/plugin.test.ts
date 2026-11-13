import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';
import { infisicalPermissions } from '@infisical/backstage-plugin-infisical-common';
import { infisicalPlugin } from './plugin';

jest.mock('./service/InfisicalApi', () => {
  const mockClient = {
    getSecrets: jest.fn(),
    getSecretById: jest.fn(),
    getEnvironments: jest.fn(),
    createSecret: jest.fn(),
    updateSecret: jest.fn(),
    deleteSecret: jest.fn(),
  };

  return {
    InfisicalApiClient: jest.fn(() => mockClient),
  };
});

describe('infisical-backend', () => {
  it('starts and registers its permissions', async () => {
    const permissionsRegistry = mockServices.permissionsRegistry.mock();

    const backend = await startTestBackend({
      features: [
        infisicalPlugin,
        catalogServiceMock.factory(),
        permissionsRegistry.factory,
      ],
    });

    expect(backend).toBeDefined();
    expect(permissionsRegistry.addPermissions).toHaveBeenCalledWith(
      infisicalPermissions,
    );

    await backend.stop();
  });
});
