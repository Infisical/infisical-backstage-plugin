/**
 * Tests for PathBreadcrumbs component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PathBreadcrumbs } from './PathBreadcrumbs';
import { InfisicalEnvironment } from '../../api/types';

describe('PathBreadcrumbs', () => {
    const mockEnvironments: InfisicalEnvironment[] = [
        { id: 'env1', name: 'Development', slug: 'development' },
        { id: 'env2', name: 'Staging', slug: 'staging' },
        { id: 'env3', name: 'Production', slug: 'production' },
    ];

    const mockOnEnvironmentChange = jest.fn();
    const mockOnNavigateToBreadcrumb = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders environment selector correctly', () => {
        render(
            <PathBreadcrumbs
                environments={mockEnvironments}
                selectedEnvironment="development"
                currentPath="/"
                loadingEnvironments={false}
                onEnvironmentChange={mockOnEnvironmentChange}
                onNavigateToBreadcrumb={mockOnNavigateToBreadcrumb}
            />
        );

        // Check if environment dropdown renders
        expect(screen.getByRole('button', { name: /development/i })).toBeInTheDocument();
    });

    it('renders home link correctly', () => {
        render(
            <PathBreadcrumbs
                environments={mockEnvironments}
                selectedEnvironment="development"
                currentPath="/"
                loadingEnvironments={false}
                onEnvironmentChange={mockOnEnvironmentChange}
                onNavigateToBreadcrumb={mockOnNavigateToBreadcrumb}
            />
        );

        // Home link should be present
        const homeLink = screen.getByRole('button', { name: '' });
        expect(homeLink).toBeInTheDocument();

        // Click on home link should navigate to root
        fireEvent.click(homeLink);
        expect(mockOnNavigateToBreadcrumb).toHaveBeenCalledWith(-1);
    });

    it('renders path parts correctly', () => {
        render(
            <PathBreadcrumbs
                environments={mockEnvironments}
                selectedEnvironment="development"
                currentPath="/api/keys"
                loadingEnvironments={false}
                onEnvironmentChange={mockOnEnvironmentChange}
                onNavigateToBreadcrumb={mockOnNavigateToBreadcrumb}
            />
        );

        // Path parts should be rendered as links
        expect(screen.getByRole('button', { name: 'api' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'keys' })).toBeInTheDocument();
    });

    it('navigates when clicking on path parts', () => {
        render(
            <PathBreadcrumbs
                environments={mockEnvironments}
                selectedEnvironment="development"
                currentPath="/api/keys"
                loadingEnvironments={false}
                onEnvironmentChange={mockOnEnvironmentChange}
                onNavigateToBreadcrumb={mockOnNavigateToBreadcrumb}
            />
        );

        // Click on first path part
        fireEvent.click(screen.getByRole('button', { name: 'api' }));
        expect(mockOnNavigateToBreadcrumb).toHaveBeenCalledWith(0);

        // Click on second path part
        fireEvent.click(screen.getByRole('button', { name: 'keys' }));
        expect(mockOnNavigateToBreadcrumb).toHaveBeenCalledWith(1);
    });

    it('calls onEnvironmentChange when environment is changed', () => {
        render(
            <PathBreadcrumbs
                environments={mockEnvironments}
                selectedEnvironment="development"
                currentPath="/"
                loadingEnvironments={false}
                onEnvironmentChange={mockOnEnvironmentChange}
                onNavigateToBreadcrumb={mockOnNavigateToBreadcrumb}
            />
        );

        // Open dropdown
        fireEvent.mouseDown(screen.getByRole('button', { name: /development/i }));

        // Select another environment
        fireEvent.click(screen.getByText('Staging'));

        expect(mockOnEnvironmentChange).toHaveBeenCalled();
    });

    it('shows empty state when no environments are available', () => {
        render(
            <PathBreadcrumbs
                environments={[]}
                selectedEnvironment={null}
                currentPath="/"
                loadingEnvironments={false}
                onEnvironmentChange={mockOnEnvironmentChange}
                onNavigateToBreadcrumb={mockOnNavigateToBreadcrumb}
            />
        );

        expect(screen.getByText('No environments available')).toBeInTheDocument();
    });
});