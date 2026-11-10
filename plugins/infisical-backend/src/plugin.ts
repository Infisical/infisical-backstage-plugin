import {
  createBackendPlugin,
  coreServices,
} from '@backstage/backend-plugin-api';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { infisicalPermissions } from '@infisical/backstage-plugin-infisical-common';

import { createRouter } from './service/router';

/**
 * The Infisical backend plugin.
 * This plugin provides an API for interacting with Infisical secrets management.
 *
 * @public
 */
export const infisicalPlugin = createBackendPlugin({
  pluginId: 'infisical-backend',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        http: coreServices.httpRouter,
        config: coreServices.rootConfig,
        httpAuth: coreServices.httpAuth,
        auth: coreServices.auth,
        permissions: coreServices.permissions,
        permissionsRegistry: coreServices.permissionsRegistry,
        catalog: catalogServiceRef,
      },
      async init({
        http,
        logger,
        config,
        httpAuth,
        auth,
        permissions,
        permissionsRegistry,
        catalog,
      }) {
        permissionsRegistry.addPermissions(infisicalPermissions);

        http.use(
          await createRouter({
            logger,
            config,
            httpAuth,
            auth,
            permissions,
            catalog,
          }),
        );
      },
    });
  },
});
