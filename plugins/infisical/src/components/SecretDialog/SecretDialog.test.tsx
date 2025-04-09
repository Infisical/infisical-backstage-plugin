/**
 * Tests for SecretDialog component
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SecretDialog } from './SecretDialog';
import { InfisicalSecret } from '../../api/types';

describe('SecretDialog', () => {
  const mockSecret: InfisicalSecret = {
    id: 'secret-id',
    key: 'API_KEY',
    secretKey: 'API_KEY',
    value: 'test-api-key',
    secretValue: 'test-api-key',
    type: 'shared',
    comment: 'Test comment',
    secretComment: 'Test comment',
    createdAt: '2023-01-01',
    updatedAt: '2023-01-01',
    readonly: false,
  };

  const mockOnClose = jest.fn();
  const mockOnSave = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render create mode correctly', () => {
    render(
      <SecretDialog
        open
        mode="create"
        onClose={mockOnClose}
        onSave={mockOnSave}
        fetchSecretValue={jest.fn()}
      />
    );

    expect(screen.getByText('Create Secret')).toBeInTheDocument();
    expect(screen.getByLabelText('Secret key')).toBeInTheDocument();
    expect(screen.getByLabelText('Secret value')).toBeInTheDocument();
    expect(screen.getByLabelText('Secret comment')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('should render edit mode with secret data', () => {
    render(
      <SecretDialog
        open
        mode="edit"
        secret={mockSecret}
        onClose={mockOnClose}
        onSave={mockOnSave}
        fetchSecretValue={jest.fn()}
      />
    );

    expect(screen.getByText('Edit Secret')).toBeInTheDocument();
    expect(screen.getByDisplayValue('API_KEY')).toBeInTheDocument();
    expect(screen.getByDisplayValue('test-api-key')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test comment')).toBeInTheDocument();
  });

  it('should validate form fields', async () => {
    render(
      <SecretDialog
        open
        mode="create"
        onClose={mockOnClose}
        onSave={mockOnSave}
      />
    );

    // Try to save with empty fields
    fireEvent.click(screen.getByText('Save'));

    // Wait for validation messages
    await waitFor(() => {
      expect(screen.getByText('Key is required')).toBeInTheDocument();
      expect(screen.getByText('Value is required')).toBeInTheDocument();
    });

    // Make sure save was not called
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('should call onSave with form values when Save button is clicked', async () => {
    render(
      <SecretDialog
        open
        mode="create"
        onClose={mockOnClose}
        onSave={mockOnSave}
      />
    );

    // Fill in the form
    fireEvent.change(screen.getByLabelText('Secret key'), { target: { value: 'NEW_KEY' } });
    fireEvent.change(screen.getByLabelText('Secret value'), { target: { value: 'new-value' } });
    fireEvent.change(screen.getByLabelText('Secret comment'), { target: { value: 'New comment' } });

    // Click save
    fireEvent.click(screen.getByText('Save'));

    // Verify onSave was called with the right values
    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith({
        secretKey: 'NEW_KEY',
        secretValue: 'new-value',
        secretComment: 'New comment',
      });
    });

    // Verify onClose was called after successful save
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should handle errors during save', async () => {
    const mockErrorMessage = 'Failed to save secret';
    const mockOnSaveWithError = jest.fn().mockRejectedValue(new Error(mockErrorMessage));

    render(
      <SecretDialog
        open
        mode="create"
        onClose={mockOnClose}
        onSave={mockOnSaveWithError}
      />
    );

    // Fill in the form
    fireEvent.change(screen.getByLabelText('Secret key'), { target: { value: 'NEW_KEY' } });
    fireEvent.change(screen.getByLabelText('Secret value'), { target: { value: 'new-value' } });

    // Click save
    fireEvent.click(screen.getByText('Save'));

    // Verify error message is displayed
    await waitFor(() => {
      expect(screen.getByText(mockErrorMessage)).toBeInTheDocument();
    });

    // Verify onClose was not called after error
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('should call onClose when Cancel button is clicked', () => {
    render(
      <SecretDialog
        open
        mode="create"
        onClose={mockOnClose}
        onSave={mockOnSave}
      />
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(mockOnClose).toHaveBeenCalled();
  });
});