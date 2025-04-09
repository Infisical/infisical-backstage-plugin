import { loggerToWinstonLogger } from '@backstage/backend-common';
import {
  createBackendPlugin,
  coreServices,
} from '@backstage/backend-plugin-api';

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
      },
      async init({ http, logger, config }) {
        http.use(
          await createRouter({
            logger: loggerToWinstonLogger(logger),
            config,
          }),
        );
      },
    });
  },
});
