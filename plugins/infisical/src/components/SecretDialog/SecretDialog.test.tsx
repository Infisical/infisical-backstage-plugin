/**
 * Tests for SecretDialog component
 */

import React from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
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
        fetchSecretValue={jest.fn()}
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
        fetchSecretValue={jest.fn()}
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
        fetchSecretValue={jest.fn()}
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

  it('fetches a value hidden by Infisical when values can be read', async () => {
    const fetchSecretValue = jest.fn().mockResolvedValue(mockSecret);

    render(
      <SecretDialog
        open
        mode="edit"
        secret={{ ...mockSecret, secretValue: '<hidden-by-infisical>' }}
        onClose={mockOnClose}
        onSave={mockOnSave}
        fetchSecretValue={fetchSecretValue}
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('test-api-key')).toBeInTheDocument();
    });
    expect(fetchSecretValue).toHaveBeenCalledWith('secret-id', 'API_KEY');
  });

  describe('when the value hidden by Infisical cannot be loaded', () => {
    const hiddenSecret = { ...mockSecret, secretValue: '<hidden-by-infisical>' };

    it('never shows the placeholder as the value', () => {
      render(
        <SecretDialog
          open
          mode="edit"
          secret={hiddenSecret}
          onClose={mockOnClose}
          onSave={mockOnSave}
          fetchSecretValue={jest.fn().mockReturnValue(new Promise(() => {}))}
        />
      );

      expect(screen.getByLabelText('Secret value')).toHaveValue('');
    });

    it('blocks saving, so the placeholder cannot overwrite the secret', async () => {
      // The parent resolves with null when the request fails
      const fetchSecretValue = jest.fn().mockResolvedValue(null);

      render(
        <SecretDialog
          open
          mode="edit"
          secret={hiddenSecret}
          onClose={mockOnClose}
          onSave={mockOnSave}
          fetchSecretValue={fetchSecretValue}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Could not load the current value/)).toBeInTheDocument();
      });
      expect(screen.getByLabelText('Secret value')).toHaveValue('');

      fireEvent.change(screen.getByLabelText('Secret comment'), { target: { value: 'Updated comment' } });

      const save = screen.getByTestId('save-secret-button');
      expect(save).toBeDisabled();
      fireEvent.click(save);
      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it('allows saving again after the dialog is reopened and the value loads', async () => {
      const fetchSecretValue = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(mockSecret);
      const dialog = (open: boolean) => (
        <SecretDialog
          open={open}
          mode="edit"
          secret={hiddenSecret}
          onClose={mockOnClose}
          onSave={mockOnSave}
          fetchSecretValue={fetchSecretValue}
        />
      );

      const { rerender } = render(dialog(true));
      await waitFor(() => {
        expect(screen.getByTestId('save-secret-button')).toBeDisabled();
      });

      rerender(dialog(false));
      rerender(dialog(true));

      await waitFor(() => {
        expect(screen.getByDisplayValue('test-api-key')).toBeInTheDocument();
      });
      expect(screen.getByTestId('save-secret-button')).toBeEnabled();
    });
  });

  describe('when a value request outlives its dialog', () => {
    const secretA = { ...mockSecret, id: 'a', secretKey: 'KEY_A', secretValue: '<hidden-by-infisical>' };
    const secretB = { ...mockSecret, id: 'b', secretKey: 'KEY_B', secretValue: '<hidden-by-infisical>' };

    /** A fetchSecretValue whose requests are resolved by the test, per secret id */
    const deferredFetch = () => {
      const resolvers: Record<string, (secret: InfisicalSecret | null) => void> = {};
      const fetchSecretValue = jest.fn(
        (id: string) =>
          new Promise<InfisicalSecret | null>(resolve => {
            resolvers[id] = resolve;
          }),
      );
      return { fetchSecretValue, resolvers };
    };

    const dialog = (
      open: boolean,
      secret: InfisicalSecret,
      fetchSecretValue: jest.Mock,
    ) => (
      <SecretDialog
        open={open}
        mode="edit"
        secret={secret}
        onClose={mockOnClose}
        onSave={mockOnSave}
        fetchSecretValue={fetchSecretValue}
      />
    );

    it("does not put the previous secret's value into the next secret's form", async () => {
      const { fetchSecretValue, resolvers } = deferredFetch();

      // Open A, close it before its value arrives, then open B
      const { rerender } = render(dialog(true, secretA, fetchSecretValue));
      rerender(dialog(false, secretA, fetchSecretValue));
      rerender(dialog(true, secretB, fetchSecretValue));
      expect(fetchSecretValue).toHaveBeenCalledTimes(2);

      // A's response arrives first
      await act(async () => {
        resolvers.a({ ...secretA, secretValue: 'value-of-a' });
      });

      expect(screen.getByLabelText('Secret value')).toHaveValue('');
      // B is still loading, so it cannot be saved yet
      expect(screen.getByTestId('save-secret-button')).toBeDisabled();

      await act(async () => {
        resolvers.b({ ...secretB, secretValue: 'value-of-b' });
      });

      expect(screen.getByLabelText('Secret value')).toHaveValue('value-of-b');
      expect(screen.getByLabelText('Secret key')).toHaveValue('KEY_B');

      fireEvent.click(screen.getByText('Save'));
      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(
          expect.objectContaining({ secretKey: 'KEY_B', secretValue: 'value-of-b' }),
        );
      });
    });

    it("does not block the next secret when the previous secret's request fails", async () => {
      const { fetchSecretValue, resolvers } = deferredFetch();

      const { rerender } = render(dialog(true, secretA, fetchSecretValue));
      rerender(dialog(false, secretA, fetchSecretValue));
      rerender(dialog(true, secretB, fetchSecretValue));

      await act(async () => {
        resolvers.a(null);
      });
      expect(screen.queryByText(/Could not load the current value/)).not.toBeInTheDocument();

      await act(async () => {
        resolvers.b({ ...secretB, secretValue: 'value-of-b' });
      });
      expect(screen.getByTestId('save-secret-button')).toBeEnabled();
    });

    it('is not left loading when the dialog is reopened to create a secret', async () => {
      const { fetchSecretValue } = deferredFetch();

      const { rerender } = render(dialog(true, secretA, fetchSecretValue));
      rerender(dialog(false, secretA, fetchSecretValue));
      rerender(
        <SecretDialog
          open
          mode="create"
          onClose={mockOnClose}
          onSave={mockOnSave}
          fetchSecretValue={fetchSecretValue}
        />
      );

      expect(screen.getByLabelText('Secret key')).toBeEnabled();
      expect(screen.getByTestId('save-secret-button')).toBeEnabled();
    });
  });

  describe('when the value read permission resolves with the dialog open', () => {
    // While the permission check is loading the frontend treats values as
    // unreadable, although the listing already carries Infisical's placeholder
    const hiddenSecret = { ...mockSecret, secretValue: '<hidden-by-infisical>' };
    const dialog = (canReadValue: boolean, fetchSecretValue: jest.Mock) => (
      <SecretDialog
        open
        mode="edit"
        secret={hiddenSecret}
        onClose={mockOnClose}
        onSave={mockOnSave}
        fetchSecretValue={fetchSecretValue}
        canReadValue={canReadValue}
      />
    );

    it('keeps what the user typed and loads the value', async () => {
      const fetchSecretValue = jest.fn().mockResolvedValue(mockSecret);
      const { rerender } = render(dialog(false, fetchSecretValue));

      fireEvent.change(screen.getByLabelText('Secret key'), { target: { value: 'RENAMED_KEY' } });
      fireEvent.change(screen.getByLabelText('Secret comment'), { target: { value: 'Updated comment' } });

      rerender(dialog(true, fetchSecretValue));

      await waitFor(() => {
        expect(screen.getByLabelText('Secret value')).toHaveValue('test-api-key');
      });
      expect(screen.getByLabelText('Secret key')).toHaveValue('RENAMED_KEY');
      expect(screen.getByLabelText('Secret comment')).toHaveValue('Updated comment');
    });

    it('does not replace a value the user already typed', async () => {
      const fetchSecretValue = jest.fn().mockResolvedValue(mockSecret);
      const { rerender } = render(dialog(false, fetchSecretValue));

      fireEvent.change(screen.getByLabelText('Secret value'), { target: { value: 'typed-value' } });

      rerender(dialog(true, fetchSecretValue));

      await waitFor(() => {
        expect(fetchSecretValue).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(screen.getByLabelText('Secret value')).toBeEnabled();
      });
      expect(screen.getByLabelText('Secret value')).toHaveValue('typed-value');
    });
  });

  describe('when values cannot be read', () => {
    // The backend redacts listed values to '' without value.read
    const redactedSecret = { ...mockSecret, value: '', secretValue: '' };

    const renderEdit = (fetchSecretValue = jest.fn()) =>
      render(
        <SecretDialog
          open
          mode="edit"
          secret={redactedSecret}
          onClose={mockOnClose}
          onSave={mockOnSave}
          fetchSecretValue={fetchSecretValue}
          canReadValue={false}
        />
      );

    it('does not fetch the value and explains how to keep it', () => {
      const fetchSecretValue = jest.fn();
      renderEdit(fetchSecretValue);

      expect(fetchSecretValue).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Secret value')).toHaveValue('');
      expect(screen.getByText(/Leave it empty to keep it/)).toBeInTheDocument();
    });

    it('saves a rename and comment change without sending a value', async () => {
      renderEdit();

      fireEvent.change(screen.getByLabelText('Secret key'), { target: { value: 'RENAMED_KEY' } });
      fireEvent.change(screen.getByLabelText('Secret comment'), { target: { value: 'Updated comment' } });
      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledTimes(1);
      });
      const [formData] = mockOnSave.mock.calls[0];
      expect(formData).toEqual({
        secretKey: 'RENAMED_KEY',
        secretComment: 'Updated comment',
      });
      expect(formData).not.toHaveProperty('secretValue');
      expect(screen.queryByText('Value is required')).not.toBeInTheDocument();
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('sends a new value when one is entered', async () => {
      renderEdit();

      fireEvent.change(screen.getByLabelText('Secret value'), { target: { value: 'replacement' } });
      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith({
          secretKey: 'API_KEY',
          secretValue: 'replacement',
          secretComment: 'Test comment',
        });
      });
    });

    it('still requires a value when creating a secret', async () => {
      render(
        <SecretDialog
          open
          mode="create"
          onClose={mockOnClose}
          onSave={mockOnSave}
          fetchSecretValue={jest.fn()}
          canReadValue={false}
        />
      );

      fireEvent.change(screen.getByLabelText('Secret key'), { target: { value: 'NEW_KEY' } });
      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(screen.getByText('Value is required')).toBeInTheDocument();
      });
      expect(mockOnSave).not.toHaveBeenCalled();
    });
  });

  it('should call onClose when Cancel button is clicked', () => {
    render(
      <SecretDialog
        open
        mode="create"
        onClose={mockOnClose}
        onSave={mockOnSave}
        fetchSecretValue={jest.fn()}
      />
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(mockOnClose).toHaveBeenCalled();
  });
});