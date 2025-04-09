/**
 * Infisical plugin main configuration
 */

import {
  createPlugin,
  createApiFactory,
  discoveryApiRef,
  fetchApiRef,
  createComponentExtension,
} from '@backstage/core-plugin-api';
import { rootRouteRef } from './routes';
import { infisicalApiRef, InfisicalClient } from './api/InfisicalClient';

/**
 * Main plugin configuration for Infisical
 */
export const infisicalPlugin = createPlugin({
  id: 'infisical',
  apis: [
    createApiFactory({
      api: infisicalApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
      },
      factory: ({ discoveryApi, fetchApi }) =>
        new InfisicalClient({ discoveryApi, fetchApi }),
    }),
  ],
  routes: {
    root: rootRouteRef,
  },
});

/**
 * Entity tab content component for displaying Infisical secrets
 */
export const EntityInfisicalContent = infisicalPlugin.provide(
  createComponentExtension({
    name: 'EntityInfisicalContent',
    component: {
      lazy: () =>
        import('./components/EntityInfisicalContent').then(
          m => m.EntityInfisicalContent,
        ),
    },
  }),
);

/**
 * Re-export API types for plugin consumers
 */
export { infisicalApiRef, type InfisicalApi } from './api/InfisicalClient';

export type {
  InfisicalSecret,
  InfisicalFolder,
  InfisicalEnvironment,
  InfisicalWorkspace,
  InfisicalSecretFormValues,
} from './api/types';
