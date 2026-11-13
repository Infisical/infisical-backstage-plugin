import React from 'react';
import { EntityInfisicalSecretsContent } from '../EntityInfisicalSecretsContent';
import { EntitySecretsProvider } from '../EntitySecretsProvider';

export const EntityInfisicalContent = () => {
    return (
        <EntitySecretsProvider>
            {(entityRef, environment, secretPath) => <EntityInfisicalSecretsContent entityRef={entityRef} environment={environment} secretPath={secretPath} />}
        </EntitySecretsProvider>
    );
};