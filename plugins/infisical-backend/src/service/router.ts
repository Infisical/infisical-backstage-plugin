import { errorHandler } from '@backstage/backend-common';
import express from 'express';
import Router from 'express-promise-router';
import { Logger } from 'winston';
import { Config } from '@backstage/config';
import { InfisicalApiClient } from './InfisicalApi';
import { InputError, NotFoundError } from '@backstage/errors';
import {
  InfisicalSecretCreateRequest,
  InfisicalSecretUpdateRequest,
  InfisicalSecretDeleteRequest,
} from './types';

/**
 * Options for creating the router.
 * @public
 */
export interface RouterOptions {
  /** Logger instance */
  logger: Logger;
  /** Config instance */
  config: Config;
}

/**
 * Creates a router for the Infisical backend plugin.
 *
 * @param options - The router options
 * @returns An express router
 * @public
 */
export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, config } = options;
  const router = Router();

  router.use(express.json());

  const infisicalApi = new InfisicalApiClient({ config, logger });

  /**
   * GET /secrets - Retrieve secrets from Infisical
   *
   * Query parameters:
   *   workspaceId - The Infisical workspace ID (required)
   *   path - The secret path (optional)
   *   environment - The environment name (optional)
   */
  router.get('/secrets', async (request, response) => {
    const { workspaceId, path, environment } = request.query;

    if (!workspaceId || typeof workspaceId !== 'string') {
      throw new InputError('workspaceId is required');
    }

    const pathStr = path ? String(path) : undefined;
    const envStr = environment ? String(environment) : undefined;

    const secrets = await infisicalApi.getSecrets(workspaceId, pathStr, envStr);
    response.json(secrets);
  });

  /**
   * GET /secrets/:secretId - Retrieve a specific secret by ID
   *
   * Path parameters:
   *   secretId - The ID of the secret to retrieve
   *
   * Query parameters:
   *   workspaceId - The Infisical workspace ID (required)
   *   path - The secret path (optional)
   *   environment - The environment name (optional)
   */
  router.get('/secrets/:secretId', async (request, response) => {
    const { secretId } = request.params;
    const { workspaceId, path, environment } = request.query;

    if (!secretId || typeof secretId !== 'string') {
      throw new InputError('secretId is required');
    }

    if (!workspaceId || typeof workspaceId !== 'string') {
      throw new InputError('workspaceId is required');
    }

    const pathStr = path ? String(path) : undefined;
    const envStr = environment ? String(environment) : undefined;

    const secret = await infisicalApi.getSecretById(workspaceId, secretId, {
      environment: envStr,
      path: pathStr,
    });
    response.json(secret);
  });

  /**
   * GET /environments - Retrieve environments for a workspace
   *
   * Query parameters:
   *   workspaceId - The Infisical workspace ID (required)
   */
  router.get('/environments', async (request, response) => {
    const { workspaceId } = request.query;

    if (!workspaceId || typeof workspaceId !== 'string') {
      throw new InputError('workspaceId is required');
    }

    const environments = await infisicalApi.getEnvironments(workspaceId);
    response.json(environments);
  });

  /**
   * POST /secrets - Create a new secret
   *
   * Body:
   *   secretKey - The key of the secret (required)
   *   secretValue - The value of the secret (required)
   *   workspaceId - The workspace ID (required)
   *   secretPath - The path for the secret (optional)
   *   environment - The environment name (optional)
   */
  router.post('/secrets', async (request, response) => {
    const secretData = request.body as InfisicalSecretCreateRequest;

    if (!secretData.secretKey || !secretData.secretValue) {
      throw new InputError('Key and value are required fields');
    }

    if (!secretData.workspaceId) {
      throw new InputError('workspaceId is required');
    }

    const secret = await infisicalApi.createSecret(secretData);
    response.status(201).json(secret);
  });

  /**
   * PUT /secrets/:secretId - Update an existing secret
   *
   * Path parameters:
   *   secretId - The ID of the secret to update
   *
   * Body:
   *   secretKey - The new key of the secret (required)
   *   secretValue - The new value of the secret (required)
   *   workspaceId - The workspace ID (required)
   */
  router.patch('/secrets/:secretId', async (request, response) => {
    const { secretId } = request.params;
    const secretData = request.body as InfisicalSecretUpdateRequest;

    if (!secretId) {
      throw new InputError('Secret ID is required');
    }

    if (!secretData.secretKey || !secretData.secretValue) {
      throw new InputError('Key and value are required fields');
    }

    if (!secretData.workspaceId) {
      throw new InputError('workspaceId is required');
    }

    const secret = await infisicalApi.updateSecret(secretData, secretId);
    response.json(secret);
  });

  /**
   * DELETE /secrets/:secretId - Delete a secret
   *
   * Path parameters:
   *   secretId - The ID of the secret to delete
   *
   * Body:
   *   workspaceId - The workspace ID (required)
   *   environment - The environment name (required)
   *   secretPath - The secret path (required)
   */
  router.delete('/secrets/:secretId', async (request, response) => {
    const { secretId } = request.params;
    const secretData = request.body as InfisicalSecretDeleteRequest;

    if (!secretId) {
      throw new InputError('Secret ID is required');
    }

    if (!secretData.workspaceId || !secretData.environment) {
      throw new InputError('workspaceId and environment are required fields');
    }

    await infisicalApi.deleteSecret(secretId, secretData);
    response.status(204).send();
  });

  router.use(errorHandler());

  return router;
}
