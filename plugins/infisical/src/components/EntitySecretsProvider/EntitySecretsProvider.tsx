/**
 * Provider component that extracts Infisical workspace information from entity annotations
 */

import React, { ReactNode } from 'react';
import { useEntity } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { InfoCard, EmptyState } from '@backstage/core-components';
import { Typography } from '@material-ui/core';
import {
    INFISICAL_PROJECT_ANNOTATION,
    INFISICAL_ENVIRONMENT_ANNOTATION,
    INFISICAL_SECRET_PATH_ANNOTATION,
} from '@infisical/backstage-plugin-infisical-common';

/**
 * Props for EntitySecretsProvider
 */
export interface EntitySecretsProviderProps {
    /**
     * Render function that receives the entity reference the secrets are
     * accessed through, plus the environment lock and secret path annotations
     * (used only to shape the UI; the backend enforces them).
     */
    children: (entityRef: string, environment?: string, secretPath?: string) => ReactNode;
}

/**
 * Component that extracts Infisical workspace information from entity
 * annotations and provides it to the child components.
 */
export const EntitySecretsProvider: React.FC<EntitySecretsProviderProps> = ({
    children
}) => {
    const { entity } = useEntity();
    const entityRef = stringifyEntityRef(entity);
    const workspaceId = entity.metadata.annotations?.[INFISICAL_PROJECT_ANNOTATION];
    const environment = entity.metadata.annotations?.[INFISICAL_ENVIRONMENT_ANNOTATION];
    const secretPath = entity.metadata.annotations?.[INFISICAL_SECRET_PATH_ANNOTATION];

    if (!workspaceId) {
        return (
            <InfoCard title="Infisical Secrets">
                <EmptyState
                    missing="info"
                    title="No Infisical project configured"
                    description={
                        <>
                            <Typography paragraph>
                                This component does not have an Infisical project configured.
                            </Typography>
                            <Typography paragraph>
                                You need to add the <code>infisical/projectId</code> annotation to your <code>entity yaml file</code>:
                            </Typography>
                            <pre>
                                {`metadata:
                    annotations:
                        infisical/projectId: your-project-id`}
                            </pre>
                        </>
                    }
                />
            </InfoCard>
        );
    }

    // Keyed by entity so navigating to another entity remounts the content
    // instead of carrying over state such as a permission-denied result or
    // the previously selected environment.
    return (
        <React.Fragment key={entityRef}>
            {children(entityRef, environment, secretPath)}
        </React.Fragment>
    );
};