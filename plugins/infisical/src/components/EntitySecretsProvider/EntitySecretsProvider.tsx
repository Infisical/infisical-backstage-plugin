/**
 * Provider component that extracts Infisical workspace information from entity annotations
 */

import React, { ReactNode } from 'react';
import { useEntity } from '@backstage/plugin-catalog-react';
import { InfoCard, EmptyState } from '@backstage/core-components';
import { Typography } from '@material-ui/core';

/**
 * Annotation key for Infisical project ID
 */
export const INFISICAL_PROJECT_ANNOTATION = 'infisical/projectId';

/**
 * Props for EntitySecretsProvider
 */
export interface EntitySecretsProviderProps {
    /**
     * Render function that receives the workspace ID
     */
    children: (workspaceId: string) => ReactNode;
}

/**
 * Component that extracts Infisical workspace information from entity
 * annotations and provides it to the child components.
 */
export const EntitySecretsProvider: React.FC<EntitySecretsProviderProps> = ({
    children
}) => {
    const { entity } = useEntity();
    const workspaceId = entity.metadata.annotations?.[INFISICAL_PROJECT_ANNOTATION];

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

    return <>{children(workspaceId)}</>;
};