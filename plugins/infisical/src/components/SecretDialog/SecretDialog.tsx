/**
 * Dialog component for creating, editing, and viewing secrets
 */

import React, { useState, useEffect } from 'react';
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormHelperText,
    TextField,
    makeStyles,
} from '@material-ui/core';
import { InfisicalSecret, InfisicalSecretFormValues } from '../../api/types';

const useStyles = makeStyles(theme => ({
    formControl: {
        marginBottom: theme.spacing(2),
        width: '100%',
    },
    hidden: {
        visibility: 'hidden',
    },
}));

/**
 * Dialog mode for secret operations
 */
export type DialogMode = 'create' | 'edit' | 'view';

/**
 * Props for SecretDialog component
 */
export interface SecretDialogProps {
    /** Whether the dialog is open */
    open: boolean;
    /** Mode of the dialog */
    mode: DialogMode;
    /** Secret to edit or view (if applicable) */
    secret?: InfisicalSecret;
    /** Callback when dialog is closed */
    onClose: () => void;
    /** Callback when secret is saved */
    onSave: (formData: InfisicalSecretFormValues) => Promise<void>;
    /** Function to fetch secret value */
    fetchSecretValue: (secretId: string, secretKey: string) => Promise<InfisicalSecret | null | undefined>;
}

/**
 * Dialog for creating, editing, and viewing secrets
 */
export const SecretDialog: React.FC<SecretDialogProps> = ({
    open,
    mode,
    secret,
    onClose,
    onSave,
    fetchSecretValue
}) => {
    const classes = useStyles();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formValues, setFormValues] = useState<InfisicalSecretFormValues>({
        secretKey: '',
        secretValue: '',
        secretComment: '',
    });
    
    useEffect(() => {
        if (open && secret && secret.secretValue === "<hidden-by-infisical>") {
            setIsLoading(true);
            fetchSecretValue(secret.id, secret.secretKey).then((secretResponse) => {
                if (!secretResponse) {
                    setError('Secret not found');
                    return;
                }
                setFormValues({
                    secretKey: secretResponse.secretKey,
                    secretValue: secretResponse.secretValue,
                    secretComment: secretResponse.secretComment || '',
                });
            }).finally(() => {
                setIsLoading(false);
            });
        }
    }, [open, secret, fetchSecretValue]);

    // Form validation
    const [formErrors, setFormErrors] = useState({
        secretKey: false,
        secretValue: false,
    });

    // Reset form when dialog opens or secret changes
    useEffect(() => {
        if (secret && (mode === 'edit' || mode === 'view')) {
            setFormValues({
                secretKey: secret.secretKey,
                secretValue: secret.secretValue,
                secretComment: secret.secretComment || '',
            });
        } else if (mode === 'create') {
            setFormValues({
                secretKey: '',
                secretValue: '',
                secretComment: '',
            });
        }

        setError(null);
        setFormErrors({
            secretKey: false,
            secretValue: false,
        });
    }, [secret, mode, open]);

    const validateForm = (): boolean => {
        const errors = {
            secretKey: formValues.secretKey.trim() === '',
            secretValue: formValues.secretValue.trim() === '',
        };

        setFormErrors(errors);
        return !errors.secretKey && !errors.secretValue;
    };

    const handleChange = (field: keyof InfisicalSecretFormValues) => (
        event: React.ChangeEvent<HTMLInputElement | { value: unknown }>,
    ) => {
        const value = event.target.value as string;

        setFormValues(prev => ({
            ...prev,
            [field]: value,
        }));

        // Clear error for the field when the user types
        if (formErrors[field as 'secretKey' | 'secretValue']) {
            setFormErrors(prev => ({
                ...prev,
                [field]: false,
            }));
        }
    };

    const handleSubmit = async () => {
        // Validate form before submission
        if (!validateForm()) {
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            await onSave(formValues);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const dialogTitle = {
        create: 'Create Secret',
        edit: 'Edit Secret',
        view: 'View Secret',
    }[mode];

    const isViewOnly = mode === 'view';
    const isValid = !formErrors.secretKey && !formErrors.secretValue;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogContent>
                {error && (
                    <FormHelperText error>{error}</FormHelperText>
                )}

                <FormControl className={classes.formControl}>
                    <TextField
                        label="Key"
                        variant="outlined"
                        value={formValues.secretKey}
                        onChange={handleChange('secretKey')}
                        disabled={isViewOnly || isLoading}
                        required
                        fullWidth
                        error={formErrors.secretKey}
                        helperText={formErrors.secretKey ? 'Key is required' : ''}
                        inputProps={{
                            'aria-label': 'Secret key',
                            'data-testid': 'secret-key-input',
                        }}
                    />
                </FormControl>

                <FormControl className={classes.formControl}>
                    <TextField
                        label="Value"
                        variant="outlined"
                        value={formValues.secretValue}
                        onChange={handleChange('secretValue')}
                        disabled={isViewOnly || isLoading}
                        required
                        fullWidth
                        error={formErrors.secretValue}
                        helperText={formErrors.secretValue ? 'Value is required' : ''}
                        inputProps={{
                            'aria-label': 'Secret value',
                            'data-testid': 'secret-value-input',
                        }}
                    />
                </FormControl>

                <FormControl className={classes.formControl}>
                    <TextField
                        label="Comment"
                        variant="outlined"
                        value={formValues.secretComment || ''}
                        onChange={handleChange('secretComment')}
                        disabled={isViewOnly || isLoading}
                        multiline
                        rows={3}
                        fullWidth
                        inputProps={{
                            'aria-label': 'Secret comment',
                            'data-testid': 'secret-comment-input',
                        }}
                    />
                </FormControl>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} color="primary" disabled={isLoading}>
                    Cancel
                </Button>
                {!isViewOnly && (
                    <Button
                        onClick={handleSubmit}
                        color="primary"
                        variant="contained"
                        disabled={!isValid || isLoading}
                        data-testid="save-secret-button"
                    >
                        {isLoading ? 'Saving...' : 'Save'}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};