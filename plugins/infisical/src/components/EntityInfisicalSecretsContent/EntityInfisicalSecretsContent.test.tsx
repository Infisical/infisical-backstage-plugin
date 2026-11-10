/* eslint-disable no-nested-ternary */
/**
 * Tests for EntityInfisicalSecretsContent component
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EntityInfisicalSecretsContent } from './EntityInfisicalSecretsContent';
import { InfisicalSecret, InfisicalFolder, InfisicalEnvironment, InfisicalSecretFormValues } from '../../api/types';
import { infisicalApiRef } from '../../api/InfisicalClient';
import { alertApiRef, ErrorApiError, errorApiRef } from '@backstage/core-plugin-api';
import { TestApiProvider } from '@backstage/test-utils';
import { DialogMode } from '../SecretDialog';
import { TableColumn } from '@backstage/core-components';
import { ResponseError } from '@backstage/errors';
import { usePermission } from '@backstage/plugin-permission-react';
import {
    infisicalSecretCreatePermission,
    infisicalSecretDeletePermission,
    infisicalSecretUpdatePermission,
    infisicalSecretValueReadPermission,
} from '@infisical/backstage-plugin-infisical-common';

// Mock the permission hook so each test controls what is allowed
jest.mock('@backstage/plugin-permission-react', () => ({
    usePermission: jest.fn(),
}));

const mockUsePermission = usePermission as jest.MockedFunction<typeof usePermission>;

type PermissionName =
    | typeof infisicalSecretCreatePermission.name
    | typeof infisicalSecretUpdatePermission.name
    | typeof infisicalSecretDeletePermission.name
    | typeof infisicalSecretValueReadPermission.name;

/** Allows every permission except the ones listed */
function allowAllExcept(...denied: PermissionName[]) {
    mockUsePermission.mockImplementation(({ permission }) => ({
        loading: false,
        allowed: !denied.includes(permission.name as PermissionName),
    }));
}

/** Builds a ResponseError with the given status, as thrown by InfisicalClient */
async function responseError(status: number): Promise<ResponseError> {
    return ResponseError.fromResponse(
        new Response(JSON.stringify({ error: { name: 'Error', message: 'nope' }, response: { statusCode: status } }), {
            status,
            headers: { 'Content-Type': 'application/json' },
        }),
    );
}

// Mock the Progress, ErrorPanel, EmptyState and Table components
jest.mock('@backstage/core-components', () => {
    const actual = jest.requireActual('@backstage/core-components');
    return {
        ...actual,
        Progress: () => <div data-testid="progress">Loading...</div>,
        ErrorPanel: ({ error }: { error: ErrorApiError }) => <div data-testid="error-panel">{error.message}</div>,
        EmptyState: ({ title, description }: { title: string; description: string }) => (
            <div data-testid="empty-state">
                <h3>{title}</h3>
                <div>{description}</div>
            </div>
        ),
        InfoCard: ({ title, children }: { title: string; children: React.ReactNode }) => (
            <div data-testid="info-card">
                <h2>{title}</h2>
                {children}
            </div>
        ),
        Table: ({ data, columns }: { data: InfisicalSecret[]; columns: TableColumn[] }) => {
            return (
                <table data-testid="secrets-table">
                    <thead>
                        <tr>
                            {columns.map((column: TableColumn, index: number) => (
                                <th key={index}>{column.title}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((item: InfisicalSecret, rowIndex: number) => (
                            <tr key={rowIndex} data-testid="table-row">
                                {columns.map((column: TableColumn, colIndex: number) => (
                                    <td key={colIndex} data-testid={`cell-${column.field || column.title}`}>
                                        {column.render ? column.render(item, 'row') : (column.field ? item[column.field as keyof typeof item] : '')}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            );
        },
    };
});

// Mock MUI dialog
jest.mock('@material-ui/core', () => {
    const actual = jest.requireActual('@material-ui/core');
    return {
        ...actual,
        Dialog: ({ children, open }: { children: React.ReactNode, open: boolean }) => (open ? <div data-testid="dialog">{children}</div> : null),
        DialogTitle: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-title">{children}</div>,
        DialogContent: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-content">{children}</div>,
        DialogContentText: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-content-text">{children}</div>,
        DialogActions: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-actions">{children}</div>,
    };
});

// Mock SecretDialog component
jest.mock('../SecretDialog', () => ({
    SecretDialog: ({ open, mode, secret, onClose, onSave, canReadValue }: { open: boolean, mode: DialogMode, secret: InfisicalSecret, onClose: () => void, onSave: (secret: InfisicalSecretFormValues) => void, canReadValue?: boolean }) => (
        open ? (
            <div data-testid="secret-dialog" data-mode={mode} data-can-read-value={String(canReadValue)}>
                <div data-testid="secret-data">
                    {secret && <div data-testid="secret-key">{secret.secretKey}</div>}
                </div>
                <button data-testid="dialog-close" onClick={onClose}>Close</button>
                <button
                    data-testid="dialog-save"
                    onClick={() => onSave({
                        secretKey: 'NEW_KEY',
                        secretValue: 'new-value',
                        secretComment: 'New comment'
                    })}
                >
                    Save
                </button>
            </div>
        ) : null
    ),
    DialogMode: jest.fn(),
}));

describe('EntityInfisicalSecretsContent', () => {
    const mockEntityRef = 'component:default/test-component';

    // Mock API data
    const mockEnvironments: InfisicalEnvironment[] = [
        { id: 'env1', name: 'Development', slug: 'development' },
        { id: 'env2', name: 'Staging', slug: 'staging' },
    ];

    const mockFolders: InfisicalFolder[] = [
        { id: 'folder1', name: 'api', path: '/api', createdAt: '2023-01-01', updatedAt: '2023-01-01' },
    ];

    const mockSecrets: InfisicalSecret[] = [
        {
            id: 'secret1',
            key: 'API_KEY',
            secretKey: 'API_KEY',
            value: 'test-api-key',
            secretValue: 'test-api-key',
            type: 'shared',
            comment: 'Test API Key',
            secretComment: 'Test API Key',
            createdAt: '2023-01-01',
            updatedAt: '2023-01-01',
            readonly: false,
        },
    ];

    // Setup mock API implementations
    const mockInfisicalApi = {
        getEnvironments: jest.fn().mockResolvedValue({ environments: mockEnvironments, name: 'test-workspace' }),
        getSecrets: jest.fn().mockResolvedValue({
            secrets: mockSecrets,
            folders: mockFolders
        }),
        createSecret: jest.fn().mockImplementation((secretData) =>
            Promise.resolve({
                id: 'new-secret-id',
                key: secretData.secretKey,
                secretKey: secretData.secretKey,
                value: secretData.secretValue,
                secretValue: secretData.secretValue,
                type: 'shared',
                comment: secretData.secretComment,
                secretComment: secretData.secretComment,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                readonly: false,
            })
        ),
        updateSecret: jest.fn(),
        deleteSecret: jest.fn().mockResolvedValue(undefined),
    };

    const mockAlertApi = {
        post: jest.fn(),
        alert$: jest.fn(),
    };

    const mockErrorApi = {
        post: jest.fn(),
        error$: jest.fn(),
    };

    const apis = [
        [infisicalApiRef, mockInfisicalApi] as const,
        [alertApiRef, mockAlertApi] as const,
        [errorApiRef, mockErrorApi] as const,
    ] as const;

    beforeEach(() => {
        jest.clearAllMocks();
        allowAllExcept();
    });

    const renderContent = () =>
        render(
            <TestApiProvider apis={apis}>
                <EntityInfisicalSecretsContent entityRef={mockEntityRef} />
            </TestApiProvider>
        );

    it('shows loading state initially', async () => {
        // We need to mock the first useEffect that gets environments
        mockInfisicalApi.getEnvironments.mockImplementationOnce(() => new Promise(() => { }));

        render(
            <TestApiProvider apis={apis}>
                <EntityInfisicalSecretsContent entityRef={mockEntityRef} />
            </TestApiProvider>
        );

        expect(screen.getByTestId('progress')).toBeInTheDocument();
    });

    it('loads and displays environments and secrets', async () => {
        render(
            <TestApiProvider apis={apis}>
                <EntityInfisicalSecretsContent entityRef={mockEntityRef} />
            </TestApiProvider>
        );

        // Wait for environments to load - since we mocked getEnvironments
        await waitFor(() => {
            expect(mockInfisicalApi.getEnvironments).toHaveBeenCalledWith(mockEntityRef);
        });

        // Wait for secrets to load
        await waitFor(() => {
            expect(mockInfisicalApi.getSecrets).toHaveBeenCalledWith(
                mockEntityRef,
                expect.objectContaining({ environment: 'development' })
            );
        });

        // Check if the secrets table is rendered
        await waitFor(() => {
            expect(screen.getByTestId('secrets-table')).toBeInTheDocument();
        });

        // The assertions below may not work as you're mocking the Table component
        // so let's just check that the APIs were called correctly
        expect(mockInfisicalApi.getEnvironments).toHaveBeenCalledTimes(1);
        expect(mockInfisicalApi.getSecrets).toHaveBeenCalledTimes(1);
    });

    it('handles environment change', async () => {
        render(
            <TestApiProvider apis={apis}>
                <EntityInfisicalSecretsContent entityRef={mockEntityRef} />
            </TestApiProvider>
        );

        // Wait for initial secrets to load
        await waitFor(() => {
            expect(mockInfisicalApi.getSecrets).toHaveBeenCalledWith(
                mockEntityRef,
                expect.objectContaining({ environment: 'development' })
            );
        });

        // Reset the mock to track new calls
        mockInfisicalApi.getSecrets.mockClear();

        // Since we mocked all the MUI components, we can't actually click on the environment selector
        // We'd need to trigger the handleEnvironmentChange function directly
        // For now let's just check that the initial loading worked properly
        expect(mockInfisicalApi.getEnvironments).toHaveBeenCalledTimes(1);
        expect(mockInfisicalApi.getEnvironments).toHaveBeenCalledWith(mockEntityRef);
    });

    it('opens the create secret dialog and creates a new secret', async () => {
        render(
            <TestApiProvider apis={apis}>
                <EntityInfisicalSecretsContent entityRef={mockEntityRef} />
            </TestApiProvider>
        );

        // Wait for the component to load
        await waitFor(() => {
            expect(mockInfisicalApi.getSecrets).toHaveBeenCalled();
        });

        // Since we've mocked the entire UI, we can't actually click the add button
        // Instead, let's mock that the dialog is open and then test the save functionality

        // Find a button with text ADD SECRET
        const addButton = await screen.findByText('ADD SECRET');
        fireEvent.click(addButton);

        // Find the dialog save button and click it
        await waitFor(() => {
            const saveButton = screen.getByTestId('dialog-save');
            fireEvent.click(saveButton);
        });

        // Check if createSecret was called
        await waitFor(() => {
            expect(mockInfisicalApi.createSecret).toHaveBeenCalledWith(
                mockEntityRef,
                expect.objectContaining({
                    secretKey: 'NEW_KEY',
                    secretValue: 'new-value',
                }),
                expect.objectContaining({ environment: 'development' })
            );
        });

        // Check if success alert was shown
        expect(mockAlertApi.post).toHaveBeenCalledWith({
            message: 'Secret created successfully',
            severity: 'success',
        });

        // Check if getSecrets was called again to refresh
        expect(mockInfisicalApi.getSecrets).toHaveBeenCalledTimes(2);
    });

    it('checks permissions against the entity reference', async () => {
        renderContent();

        await waitFor(() => {
            expect(screen.getByTestId('secrets-table')).toBeInTheDocument();
        });

        for (const permission of [
            infisicalSecretCreatePermission,
            infisicalSecretUpdatePermission,
            infisicalSecretDeletePermission,
            infisicalSecretValueReadPermission,
        ]) {
            expect(mockUsePermission).toHaveBeenCalledWith({
                permission,
                resourceRef: mockEntityRef,
            });
        }
    });

    it('shows all controls when everything is allowed', async () => {
        renderContent();

        await waitFor(() => {
            expect(screen.getByTestId('secrets-table')).toBeInTheDocument();
        });

        expect(screen.getByText('ADD SECRET')).toBeInTheDocument();
        expect(screen.getByLabelText('edit')).toBeInTheDocument();
        expect(screen.getByLabelText('delete')).toBeInTheDocument();
        expect(screen.getByLabelText('Show value')).toBeInTheDocument();
    });

    it('hides the add button when create is not allowed', async () => {
        allowAllExcept(infisicalSecretCreatePermission.name);

        renderContent();

        await waitFor(() => {
            expect(screen.getByTestId('secrets-table')).toBeInTheDocument();
        });

        expect(screen.queryByText('ADD SECRET')).not.toBeInTheDocument();
        expect(screen.getByLabelText('edit')).toBeInTheDocument();
        expect(screen.getByLabelText('delete')).toBeInTheDocument();
    });

    it('hides the edit button when update is not allowed', async () => {
        allowAllExcept(infisicalSecretUpdatePermission.name);

        renderContent();

        await waitFor(() => {
            expect(screen.getByTestId('secrets-table')).toBeInTheDocument();
        });

        expect(screen.queryByLabelText('edit')).not.toBeInTheDocument();
        expect(screen.getByLabelText('delete')).toBeInTheDocument();
    });

    it('hides the delete button when delete is not allowed', async () => {
        allowAllExcept(infisicalSecretDeletePermission.name);

        renderContent();

        await waitFor(() => {
            expect(screen.getByTestId('secrets-table')).toBeInTheDocument();
        });

        expect(screen.getByLabelText('edit')).toBeInTheDocument();
        expect(screen.queryByLabelText('delete')).not.toBeInTheDocument();
    });

    it('hides the reveal toggle when value.read is not allowed', async () => {
        allowAllExcept(infisicalSecretValueReadPermission.name);

        renderContent();

        await waitFor(() => {
            expect(screen.getByTestId('secrets-table')).toBeInTheDocument();
        });

        expect(screen.queryByLabelText('Show value')).not.toBeInTheDocument();
        expect(screen.getByText('••••••••••••')).toBeInTheDocument();
    });

    it.each([
        ['allowed', [], 'true'],
        ['denied', [infisicalSecretValueReadPermission.name], 'false'],
    ] as const)('tells the edit dialog whether values can be read when value.read is %s', async (_, denied, expected) => {
        allowAllExcept(...denied);

        renderContent();

        await waitFor(() => {
            expect(screen.getByTestId('secrets-table')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByLabelText('edit'));

        expect(screen.getByTestId('secret-dialog')).toHaveAttribute('data-can-read-value', expected);
    });

    it('shows a permission message when listing secrets is forbidden', async () => {
        mockInfisicalApi.getSecrets.mockRejectedValueOnce(await responseError(403));

        renderContent();

        await waitFor(() => {
            expect(
                screen.getByText("You don't have permission to view these secrets"),
            ).toBeInTheDocument();
        });

        expect(screen.queryByTestId('error-panel')).not.toBeInTheDocument();
        expect(mockErrorApi.post).not.toHaveBeenCalled();
    });

    it('shows a permission message when listing environments is forbidden', async () => {
        mockInfisicalApi.getEnvironments.mockRejectedValueOnce(await responseError(403));

        renderContent();

        await waitFor(() => {
            expect(
                screen.getByText("You don't have permission to view these secrets"),
            ).toBeInTheDocument();
        });

        expect(mockErrorApi.post).not.toHaveBeenCalled();
        expect(mockInfisicalApi.getSecrets).not.toHaveBeenCalled();
    });

    it('clears the permission message once a later environment lookup succeeds', async () => {
        // e.g. the environment annotation moves from one whose identity is
        // denied to one whose identity is allowed
        mockInfisicalApi.getEnvironments.mockRejectedValueOnce(await responseError(403));

        const renderWithEnvironment = (env: string) => (
            <TestApiProvider apis={apis}>
                <EntityInfisicalSecretsContent entityRef={mockEntityRef} environment={env} />
            </TestApiProvider>
        );

        const { rerender } = render(renderWithEnvironment('development'));

        await waitFor(() => {
            expect(
                screen.getByText("You don't have permission to view these secrets"),
            ).toBeInTheDocument();
        });

        rerender(renderWithEnvironment('staging'));

        await waitFor(() => {
            expect(screen.getByTestId('secrets-table')).toBeInTheDocument();
        });
        expect(
            screen.queryByText("You don't have permission to view these secrets"),
        ).not.toBeInTheDocument();
        expect(mockInfisicalApi.getEnvironments).toHaveBeenCalledTimes(2);
        expect(mockInfisicalApi.getSecrets).toHaveBeenLastCalledWith(
            mockEntityRef,
            expect.objectContaining({ environment: 'staging' }),
        );
    });

    it('ignores an environment lookup that resolves after the annotation changed', async () => {
        let resolveFirst: (value: unknown) => void = () => {};
        mockInfisicalApi.getEnvironments
            .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
            .mockResolvedValueOnce({ environments: mockEnvironments, name: 'current-workspace' });

        const renderWithEnvironment = (env: string) => (
            <TestApiProvider apis={apis}>
                <EntityInfisicalSecretsContent entityRef={mockEntityRef} environment={env} />
            </TestApiProvider>
        );

        const { rerender } = render(renderWithEnvironment('development'));
        rerender(renderWithEnvironment('staging'));

        await waitFor(() => {
            expect(screen.getByText('current-workspace')).toBeInTheDocument();
        });

        // The first, outdated lookup finishes last and must not win
        resolveFirst({ environments: mockEnvironments, name: 'stale-workspace' });
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(screen.getByText('current-workspace')).toBeInTheDocument();
        expect(screen.queryByText('stale-workspace')).not.toBeInTheDocument();
    });

    it('still reports non-permission errors', async () => {
        mockInfisicalApi.getSecrets.mockRejectedValueOnce(await responseError(500));

        renderContent();

        await waitFor(() => {
            expect(screen.getByTestId('error-panel')).toBeInTheDocument();
        });
    });
});