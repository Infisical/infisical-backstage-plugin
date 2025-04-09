import { createServiceBuilder } from '@backstage/backend-common';
import { Server } from 'http';
import { Logger } from 'winston';
import { Config } from '@backstage/config';
import { createRouter } from './router';

/**
 * Options for the standalone server.
 * @public
 */
export interface ServerOptions {
  port: number;
  enableCors: boolean;
  logger: Logger;
  config?: Config;
}

/**
 * Starts the standalone server for development purposes.
 * @public
 */
export async function startStandaloneServer(
  options: ServerOptions,
): Promise<Server> {
  const logger = options.logger.child({ service: 'infisical-backend' });
  logger.debug('Starting application server...');

  const router = await createRouter({
    logger,
    config:
      options.config ||
      ({
        getConfig: () => ({
          has: () => false,
          getString: () => '',
          get: () => undefined,
        }),
      } as unknown as Config),
  });

  let service = createServiceBuilder(module)
    .setPort(options.port)
    .addRouter('/infisical', router);

  if (options.enableCors) {
    service = service.enableCors({ origin: 'http://localhost:3000' });
  }

  return await service.start().catch(err => {
    logger.error(err);
    process.exit(1);
  });
}

module.hot?.accept();
