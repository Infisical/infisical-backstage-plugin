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
 * Value Infisical returns in place of a value it was asked not to reveal
 */
const HIDDEN_VALUE = '<hidden-by-infisical>';

const VALUE_LOAD_FAILED =
    'Could not load the current value. Close this dialog and try again.';

const HIDDEN_VALUE_HINT =
    "You can't view this value. Leave it empty to keep it, or enter a new value to replace it.";

/**
 * Dialog mode for secret operations
 */
export type DialogMode = 'create' | 'edit' | 'view';

/**
 * Internal form state; every field is a string so it can back a text input
 */
interface FormState {
    secretKey: string;
    secretValue: string;
    secretComment: string;
}

const EMPTY_FORM: FormState = {
    secretKey: '',
    secretValue: '',
    secretComment: '',
};

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
    /**
     * Whether the user may read secret values. When false, the value of an
     * existing secret is neither fetched nor shown, and saving an edit with
     * the value left empty keeps the current value. Defaults to true.
     */
    canReadValue?: boolean;
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
    fetchSecretValue,
    canReadValue = true,
}) => {
    const classes = useStyles();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Saving without the current value would overwrite the secret, so a
    // failed load blocks the save
    const [valueLoadFailed, setValueLoadFailed] = useState(false);

    const [formValues, setFormValues] = useState<FormState>(EMPTY_FORM);

    // The existing value is unknown to the user, so an empty value field
    // means "keep the current value" rather than "missing value"
    const valueHidden = mode !== 'create' && !canReadValue;

    useEffect(() => {
        if (open && secret && !valueHidden && secret.secretValue === HIDDEN_VALUE) {
            setIsLoading(true);
            fetchSecretValue(secret.id, secret.secretKey).then((secretResponse) => {
                if (!secretResponse) {
                    setValueLoadFailed(true);
                    setError(VALUE_LOAD_FAILED);
                    return;
                }
                // Only the value is filled in, and only while the field is
                // still empty. This also runs when the value read permission
                // resolves with the dialog already open, and must not
                // overwrite what the user typed in the meantime.
                setFormValues(prev => ({
                    ...prev,
                    secretValue:
                        prev.secretValue === '' ? secretResponse.secretValue : prev.secretValue,
                }));
            }).finally(() => {
                setIsLoading(false);
            });
        }
    }, [open, secret, fetchSecretValue, valueHidden]);

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
                // Whatever the listing carries for a hidden value is a
                // placeholder. It must never reach the form, or saving would
                // store it as the value. The effect above loads the real one.
                secretValue:
                    valueHidden || secret.secretValue === HIDDEN_VALUE ? '' : secret.secretValue,
                secretComment: secret.secretComment || '',
            });
        } else if (mode === 'create') {
            setFormValues(EMPTY_FORM);
        }

        setError(null);
        setValueLoadFailed(false);
        setFormErrors({
            secretKey: false,
            secretValue: false,
        });
        // `valueHidden` is left out on purpose: it changes when the value read
        // permission check resolves, and resetting then would wipe what the
        // user already typed. The form only resets when the dialog opens or
        // the secret changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [secret, mode, open]);

    const keepsCurrentValue = valueHidden && formValues.secretValue.trim() === '';

    const validateForm = (): boolean => {
        const errors = {
            secretKey: formValues.secretKey.trim() === '',
            secretValue: !valueHidden && formValues.secretValue.trim() === '',
        };

        setFormErrors(errors);
        return !errors.secretKey && !errors.secretValue;
    };

    const handleChange = (field: keyof FormState) => (
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

        // Omitting the value tells the backend to keep the stored one
        const { secretValue, ...withoutValue } = formValues;
        const formData: InfisicalSecretFormValues = keepsCurrentValue
            ? withoutValue
            : { ...withoutValue, secretValue };

        try {
            await onSave(formData);
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

    let valueHelperText = '';
    if (formErrors.secretValue) {
        valueHelperText = 'Value is required';
    } else if (valueHidden && !isViewOnly) {
        valueHelperText = HIDDEN_VALUE_HINT;
    }

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
                        required={!valueHidden}
                        placeholder={valueHidden ? 'Hidden' : undefined}
                        fullWidth
                        error={formErrors.secretValue}
                        helperText={valueHelperText}
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
                        disabled={!isValid || isLoading || valueLoadFailed}
                        data-testid="save-secret-button"
                    >
                        {isLoading ? 'Saving...' : 'Save'}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};