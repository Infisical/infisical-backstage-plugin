import React from 'react';
import { EntityInfisicalSecretsContent } from '../EntityInfisicalSecretsContent';
import { EntitySecretsProvider } from '../EntitySecretsProvider';

export const EntityInfisicalContent = () => {
    return (
        <EntitySecretsProvider>
            {(workspaceId) => <EntityInfisicalSecretsContent workspaceId={workspaceId} />}
        </EntitySecretsProvider>
    );
};