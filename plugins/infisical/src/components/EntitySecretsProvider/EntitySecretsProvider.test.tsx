/**
 * Tests for EntitySecretsProvider component
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
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
    const mockChildComponent = jest.fn().mockImplementation((workspaceId: string) => (
        <div data-testid="child-component">Project ID: {workspaceId}</div>
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

        // Child component should be rendered with the project ID
        expect(screen.getByTestId('child-component')).toBeInTheDocument();
        expect(screen.getByText('Project ID: test-project-id')).toBeInTheDocument();

        // The mock child component should have been called with the project ID
        expect(mockChildComponent).toHaveBeenCalledWith('test-project-id');
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
});