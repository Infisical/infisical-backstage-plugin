/**
 * Tests for EntitySecretsProvider component
 */

import React, { useEffect, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { EntitySecretsProvider, INFISICAL_PROJECT_ANNOTATION } from './EntitySecretsProvider';
import { Entity } from '@backstage/catalog-model';

// Mock the InfoCard and EmptyState components
jest.mock('@backstage/core-components', () => ({
    InfoCard: ({ title, children }: any) => (
        <div data-testid="info-card">
            <h2>{title}</h2>
            {children}
        </div>
    ),
    EmptyState: ({ title, description }: any) => (
        <div data-testid="empty-state">
            <h3>{title}</h3>
            <div>{description}</div>
        </div>
    ),
}));

// Mock the useEntity hook
jest.mock('@backstage/plugin-catalog-react', () => ({
    useEntity: jest.fn(),
}));

describe('EntitySecretsProvider', () => {
    const mockChildComponent = jest.fn().mockImplementation((entityRef: string) => (
        <div data-testid="child-component">Entity: {entityRef}</div>
    ));

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders child component when project annotation is present', () => {
        const mockEntity: Entity = {
            apiVersion: 'backstage.io/v1alpha1',
            kind: 'Component',
            metadata: {
                name: 'test-component',
                annotations: {
                    [INFISICAL_PROJECT_ANNOTATION]: 'test-project-id',
                },
            },
            spec: {},
        };

        // Set up the mock to return our entity
        const useEntityMock = require('@backstage/plugin-catalog-react').useEntity;
        useEntityMock.mockReturnValue({ entity: mockEntity });

        render(
            <EntitySecretsProvider>
                {mockChildComponent}
            </EntitySecretsProvider>
        );

        // Child component should be rendered with the entity reference
        expect(screen.getByTestId('child-component')).toBeInTheDocument();
        expect(screen.getByText('Entity: component:default/test-component')).toBeInTheDocument();

        // The mock child component should have been called with the entity ref and annotations
        expect(mockChildComponent).toHaveBeenCalledWith(
            'component:default/test-component',
            undefined,
            undefined,
        );
    });

    it('shows empty state when project annotation is missing', () => {
        const mockEntity: Entity = {
            apiVersion: 'backstage.io/v1alpha1',
            kind: 'Component',
            metadata: {
                name: 'test-component',
                // No annotations
            },
            spec: {},
        };

        // Set up the mock to return our entity without annotations
        const useEntityMock = require('@backstage/plugin-catalog-react').useEntity;
        useEntityMock.mockReturnValue({ entity: mockEntity });

        render(
            <EntitySecretsProvider>
                {mockChildComponent}
            </EntitySecretsProvider>
        );

        // Info card should be rendered
        expect(screen.getByTestId('info-card')).toBeInTheDocument();
        expect(screen.getByText('Infisical Secrets')).toBeInTheDocument();

        // Empty state should be rendered
        expect(screen.getByTestId('empty-state')).toBeInTheDocument();
        expect(screen.getByText('No Infisical project configured')).toBeInTheDocument();

        // Child component should not be rendered
        expect(screen.queryByTestId('child-component')).not.toBeInTheDocument();

        // The mock child component should not have been called
        expect(mockChildComponent).not.toHaveBeenCalled();
    });

    describe('when the entity changes', () => {
        const entityNamed = (name: string): Entity => ({
            apiVersion: 'backstage.io/v1alpha1',
            kind: 'Component',
            metadata: {
                name,
                annotations: { [INFISICAL_PROJECT_ANNOTATION]: 'test-project-id' },
            },
            spec: {},
        });

        const mounts: string[] = [];

        /** Stands in for the secrets content: counts mounts and holds local state */
        const StatefulChild = ({ entityRef }: { entityRef: string }) => {
            const [denied, setDenied] = useState(false);
            useEffect(() => {
                mounts.push(entityRef);
            }, []); // eslint-disable-line react-hooks/exhaustive-deps
            return (
                <button onClick={() => setDenied(true)}>
                    {entityRef}: {denied ? 'denied' : 'allowed'}
                </button>
            );
        };

        const tree = () => (
            <EntitySecretsProvider>
                {entityRef => <StatefulChild entityRef={entityRef} />}
            </EntitySecretsProvider>
        );

        beforeEach(() => {
            mounts.length = 0;
        });

        it('remounts the content so state from the previous entity is dropped', () => {
            const useEntityMock = require('@backstage/plugin-catalog-react').useEntity;
            useEntityMock.mockReturnValue({ entity: entityNamed('a') });
            const { rerender } = render(tree());

            fireEvent.click(screen.getByRole('button'));
            expect(screen.getByText('component:default/a: denied')).toBeInTheDocument();

            useEntityMock.mockReturnValue({ entity: entityNamed('b') });
            rerender(tree());

            expect(screen.getByText('component:default/b: allowed')).toBeInTheDocument();
            expect(mounts).toEqual(['component:default/a', 'component:default/b']);
        });

        it('keeps the content mounted while the entity stays the same', () => {
            const useEntityMock = require('@backstage/plugin-catalog-react').useEntity;
            useEntityMock.mockReturnValue({ entity: entityNamed('a') });
            const { rerender } = render(tree());

            fireEvent.click(screen.getByRole('button'));
            useEntityMock.mockReturnValue({ entity: entityNamed('a') });
            rerender(tree());

            expect(screen.getByText('component:default/a: denied')).toBeInTheDocument();
            expect(mounts).toEqual(['component:default/a']);
        });
    });
});
