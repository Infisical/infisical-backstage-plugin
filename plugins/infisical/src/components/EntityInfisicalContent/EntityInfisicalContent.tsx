import React from 'react';
import { EntityInfisicalSecretsContent } from '../EntityInfisicalSecretsContent';
import { EntitySecretsProvider } from '../EntitySecretsProvider';

export const EntityInfisicalContent = () => {
    return (
        <EntitySecretsProvider>
            {(workspaceId, environment, secretPath) => <EntityInfisicalSecretsContent workspaceId={workspaceId} environment={environment} secretPath={secretPath} />}
        </EntitySecretsProvider>
    );
};