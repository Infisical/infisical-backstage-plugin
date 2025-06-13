/* eslint-disable no-nested-ternary */
/**
 * Main component for displaying and managing Infisical secrets
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  makeStyles,
  Breadcrumbs,
  Link,
  Box,
  Typography,
  InputBase,
  Select,
  MenuItem,
  FormControl,
  CircularProgress,
  Chip,
} from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import EditIcon from '@material-ui/icons/Edit';
import DeleteIcon from '@material-ui/icons/Delete';
import VisibilityIcon from '@material-ui/icons/Visibility';
import VisibilityOffIcon from '@material-ui/icons/VisibilityOff';
import LockRoundedIcon from '@material-ui/icons/LockRounded';
import FolderIcon from '@material-ui/icons/Folder';
import NavigateNextIcon from '@material-ui/icons/NavigateNext';
import HomeIcon from '@material-ui/icons/Home';
import SearchIcon from '@material-ui/icons/Search';
import ClearIcon from '@material-ui/icons/Clear';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import {
  Table,
  TableColumn,
  Progress,
  EmptyState,
  ErrorPanel,
  InfoCard,
} from '@backstage/core-components';
import { useApi, alertApiRef, errorApiRef, ErrorApiError } from '@backstage/core-plugin-api';
import { infisicalApiRef } from '../../api/InfisicalClient/InfisicalClient';
import { InfisicalSecret, InfisicalSecretFormValues, InfisicalFolder, InfisicalEnvironment } from '../../api/types';
import { SecretDialog, DialogMode } from '../SecretDialog';
import useAsyncFn from 'react-use/lib/useAsyncFn';

const useStyles = makeStyles(theme => ({
  topContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(3),
    width: '100%',
  },
  breadcrumbsContainer: {
    display: 'flex',
    alignItems: 'center',
    flexGrow: 1,
  },
  actionsContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
  },
  searchContainer: {
    position: 'relative',
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.background.paper,
    marginRight: theme.spacing(2),
    width: '240px',
    border: `1px solid ${theme.palette.divider}`,
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
  searchIcon: {
    padding: theme.spacing(0, 1),
    height: '100%',
    position: 'absolute',
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: theme.palette.text.secondary,
  },
  clearIcon: {
    padding: theme.spacing(0, 1),
    height: '100%',
    position: 'absolute',
    right: 0,
    top: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: theme.palette.text.secondary,
  },
  inputRoot: {
    color: 'inherit',
    width: '100%',
  },
  inputInput: {
    padding: theme.spacing(1, 1, 1, 0),
    paddingLeft: `calc(1em + ${theme.spacing(3)}px)`,
    paddingRight: `calc(1em + ${theme.spacing(3)}px)`,
    transition: theme.transitions.create('width'),
    width: '100%',
  },
  valueContainer: {
    display: 'flex',
    alignItems: 'center',
  },
  valueText: {
    marginRight: theme.spacing(1),
    fontFamily: 'monospace',
    maxWidth: '250px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    minWidth: '80px',
    maxWidth: '80px',
  },
  breadcrumbLink: {
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    '&:hover': {
      textDecoration: 'underline',
    },
  },
  breadcrumbLinkDisabled: {
    cursor: 'default',
    display: 'flex',
    alignItems: 'center',
    opacity: 0.6,
    '&:hover': {
      textDecoration: 'none',
    },
  },
  homeIcon: {
    fontSize: '1rem',
    marginRight: theme.spacing(0.5),
  },
  folderName: {
    display: 'flex',
    alignItems: 'center',
    color: theme.palette.primary.main,
    cursor: 'pointer',
    '&:hover': {
      textDecoration: 'underline',
    },
  },
  folderNameDisabled: {
    display: 'flex',
    alignItems: 'center',
    color: theme.palette.text.disabled,
    cursor: 'default',
    '&:hover': {
      textDecoration: 'none',
    },
  },
  folderIcon: {
    marginRight: theme.spacing(1),
    color: theme.palette.primary.main,
  },
  folderIconDisabled: {
    marginRight: theme.spacing(1),
    color: theme.palette.text.disabled,
  },
  keyIcon: {
    marginRight: theme.spacing(1),
    color: theme.palette.primary.dark,
  },
  actionButton: {
    marginLeft: theme.spacing(0.5),
  },
  tableContainer: {
    '& .MuiTableCell-root:last-child': {
      paddingRight: theme.spacing(1),
    },
  },
  addButton: {
    minWidth: '120px',
  },
  environmentSelect: {
    minWidth: '150px',
    marginRight: theme.spacing(1),
    '& .MuiSelect-root': {
      display: 'flex',
      alignItems: 'center',
    },
  },
  environmentChip: {
    margin: theme.spacing(0),
    backgroundColor: theme.palette.primary.light,
    color: theme.palette.primary.contrastText,
  },
  envIcon: {
    marginRight: theme.spacing(1),
    fontSize: '1rem',
  },
  loadingIconSmall: {
    width: '20px !important',
    height: '20px !important',
    marginRight: theme.spacing(1),
  }
}));

export interface EntityInfisicalSecretsContentProps {
  workspaceId: string;
  environment?: string;
  secretPath?: string;
}

/**
 * Create a type for the combined data
 */
type TableItem = (InfisicalSecret | InfisicalFolder) & {
  isFolder?: boolean;
  secretKey?: string;
  secretValue?: string;
  secretComment?: string;
  name?: string;
  readonly?: boolean;
};

/**
 * Component that displays and manages Infisical secrets for a specific workspace
 */
export const EntityInfisicalSecretsContent = ({ workspaceId, environment, secretPath }: EntityInfisicalSecretsContentProps) => {
  const classes = useStyles();
  const infisicalApi = useApi(infisicalApiRef);
  const alertApi = useApi(alertApiRef);
  const errorApi = useApi(errorApiRef);

  // State for environments
  const [environments, setEnvironments] = useState<InfisicalEnvironment[]>([]);
  const [selectedEnvironment, setSelectedEnvironment] = useState<string | null>(null);
  const [loadingEnvironments, setLoadingEnvironments] = useState(true);
  const [cardTitle, setCardTitle] = useState<string>("Infisical Secrets");

  // Base path that cannot be navigated above (derived from secretPath prop)
  const [basePath, setBasePath] = useState('/');

  // State for current path navigation
  const [currentPath, setCurrentPath] = useState('/');

  // Navigation control based on secretPath parameter
  const [allowNavigation, setAllowNavigation] = useState(true);

  // Determine if environment is locked (provided as prop)
  const isEnvironmentLocked = Boolean(environment);

  // Search state
  const [searchText, setSearchText] = useState('');

  // Secret dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>('create');
  const [selectedSecret, setSelectedSecret] = useState<InfisicalSecret | undefined>(undefined);

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [secretToDelete, setSecretToDelete] = useState<InfisicalSecret | undefined>(undefined);

  // Visibility toggles for secret values
  const [visibleValues, setVisibleValues] = useState<Record<string, boolean>>({});

  // State to store fetched secret values and loading states
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [loadingSecretValues, setLoadingSecretValues] = useState<Record<string, boolean>>({});

  // Initialize base path, current path, and navigation permissions based on secretPath prop
  useEffect(() => {
    if (!secretPath) {
      // No secretPath provided - allow full navigation
      setAllowNavigation(true);
      setBasePath('/');
      setCurrentPath('/');
      return;
    }

    if (secretPath.startsWith('+')) {
      // secretPath starts with "+" - allow navigation, remove "+" prefix
      setAllowNavigation(true);
      const pathWithoutPlus = secretPath.slice(1);
      const normalizedPath = pathWithoutPlus.startsWith('/') ? pathWithoutPlus : `/${pathWithoutPlus}`;
      const cleanPath = normalizedPath.endsWith('/') && normalizedPath !== '/'
        ? normalizedPath.slice(0, -1)
        : normalizedPath;
      
      setBasePath(cleanPath);
      setCurrentPath(cleanPath);
    } else {
      // secretPath provided without "+" - restrict navigation to current level only
      setAllowNavigation(false);
      const normalizedPath = secretPath.startsWith('/') ? secretPath : `/${secretPath}`;
      const cleanPath = normalizedPath.endsWith('/') && normalizedPath !== '/'
        ? normalizedPath.slice(0, -1)
        : normalizedPath;

      setBasePath(cleanPath);
      setCurrentPath(cleanPath);
    }
  }, [secretPath]);

  // Fetch environments first
  useEffect(() => {
    const fetchEnvironments = async () => {
      try {
        setLoadingEnvironments(true);
        const { environments: envs, name } = await infisicalApi.getEnvironments(workspaceId);
        setEnvironments(envs);
        setCardTitle(name || '');

        if (envs.length > 0) {
          if (environment) {
            // If environment is provided as prop, use it and lock it
            const foundEnv = envs.find(env => env.slug === environment);
            setSelectedEnvironment(foundEnv?.slug || envs[0].slug);
          } else {
            // If no environment provided, use the first one
            setSelectedEnvironment(envs[0].slug);
          }
        }

        setLoadingEnvironments(false);
      } catch (err) {
        errorApi.post(err as ErrorApiError);
        setLoadingEnvironments(false);
      }
    };

    fetchEnvironments();
  }, [infisicalApi, workspaceId, environment, errorApi]);

  // Fetch secrets from API
  const [{ value: { secrets, folders } = { secrets: [], folders: [] }, loading, error }, fetchSecrets] = useAsyncFn(async () => {
    if (!selectedEnvironment) return { secrets: [], folders: [] };

    return await infisicalApi.getSecrets(workspaceId, {
      path: currentPath !== '/' ? currentPath : undefined,
      environment: selectedEnvironment,
      viewSecretValue: false
    });
  }, [infisicalApi, workspaceId, currentPath, selectedEnvironment]);

  // Load secrets when component mounts or currentPath or selectedEnvironment changes
  useEffect(() => {
    if (selectedEnvironment) {
      fetchSecrets().catch(err => {
        errorApi.post(err as ErrorApiError);
      });

      setSecretValues({});
      setVisibleValues({});
      setLoadingSecretValues({});
    }
  }, [fetchSecrets, errorApi, workspaceId, currentPath, selectedEnvironment]);

  const handleOpenDialog = useCallback((mode: DialogMode, secret?: InfisicalSecret) => {
    setDialogMode(mode);
    setSelectedSecret(secret);
    setDialogOpen(true);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
  }, []);

  const handleSaveSecret = useCallback(async (formValues: InfisicalSecretFormValues) => {
    if (!selectedEnvironment) return;

    try {
      if (dialogMode === 'create') {
        await infisicalApi.createSecret(workspaceId, formValues, {
          path: currentPath !== '/' ? currentPath : undefined,
          environment: selectedEnvironment
        });
        alertApi.post({
          message: 'Secret created successfully',
          severity: 'success',
        });
      } else if (dialogMode === 'edit' && selectedSecret) {
        await infisicalApi.updateSecret(workspaceId, selectedSecret.secretKey, formValues, {
          path: currentPath !== '/' ? currentPath : undefined,
          environment: selectedEnvironment
        });
        alertApi.post({
          message: 'Secret updated successfully',
          severity: 'success',
        });
      }

      fetchSecrets();

      if (selectedSecret) {
        setSecretValues(prev => {
          const newValues = { ...prev };
          delete newValues[selectedSecret.id];
          return newValues;
        });

        setVisibleValues(prev => {
          const newValues = { ...prev };
          delete newValues[selectedSecret.id];
          return newValues;
        });
      }
    } catch (err) {
      errorApi.post(err as ErrorApiError);
      throw err;
    }
  }, [
    infisicalApi,
    workspaceId,
    currentPath,
    selectedEnvironment,
    fetchSecrets,
    alertApi,
    errorApi,
    dialogMode,
    selectedSecret
  ]);

  const handleOpenDeleteDialog = useCallback((secret: InfisicalSecret) => {
    setSecretToDelete(secret);
    setDeleteDialogOpen(true);
  }, []);

  const handleCloseDeleteDialog = useCallback(() => {
    setDeleteDialogOpen(false);
    setSecretToDelete(undefined);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!secretToDelete || !selectedEnvironment) return;

    try {
      await infisicalApi.deleteSecret(workspaceId, secretToDelete.secretKey, {
        path: currentPath !== '/' ? currentPath : undefined,
        environment: selectedEnvironment
      });
      alertApi.post({
        message: 'Secret deleted successfully',
        severity: 'success',
      });
      fetchSecrets();

      setSecretValues(prev => {
        const newValues = { ...prev };
        delete newValues[secretToDelete.id];
        return newValues;
      });

      setVisibleValues(prev => {
        const newValues = { ...prev };
        delete newValues[secretToDelete.id];
        return newValues;
      });

      setLoadingSecretValues(prev => {
        const newValues = { ...prev };
        delete newValues[secretToDelete.id];
        return newValues;
      });
    } catch (err) {
      errorApi.post(err as ErrorApiError);
    } finally {
      handleCloseDeleteDialog();
    }
  }, [
    alertApi,
    currentPath,
    fetchSecrets,
    handleCloseDeleteDialog,
    infisicalApi,
    secretToDelete,
    selectedEnvironment,
    workspaceId,
    errorApi
  ]);

  const fetchSecretValue = useCallback(async (secretId: string, secretKey: string) => {
    if (!selectedEnvironment) return;

    setLoadingSecretValues(prev => ({
      ...prev,
      [secretId]: true,
    }));

    let secret: InfisicalSecret | null = null;
    try {
      secret = await infisicalApi.getSecretByKey(workspaceId, secretKey, {
        path: currentPath !== '/' ? currentPath : undefined,
        environment: selectedEnvironment,
      });

      if (!secret) {
        // eslint-disable-next-line consistent-return
        return null;
      }

      setSecretValues(prev => ({
        ...prev,
        [secretId]: secret!.secretValue,
      }));

      setVisibleValues(prev => ({
        ...prev,
        [secretId]: true,
      }));
    } catch (err) {
      alertApi.post({
        message: 'Failed to load secret value',
        severity: 'error',
      });
    } finally {
      setLoadingSecretValues(prev => ({
        ...prev,
        [secretId]: false,
      }));
      // eslint-disable-next-line consistent-return, no-unsafe-finally
      return secret;
    }
  }, [infisicalApi, workspaceId, currentPath, selectedEnvironment, alertApi]);

  const toggleValueVisibility = useCallback((secretId: string, secretKey?: string) => {
    if (!secretKey) return;

    if (secretValues[secretId]) {
      setVisibleValues(prev => ({
        ...prev,
        [secretId]: !prev[secretId],
      }));
    } else {
      fetchSecretValue(secretId, secretKey);
    }
  }, [secretValues, fetchSecretValue]);

  const navigateToFolder = useCallback((folderName: string) => {
    if (!allowNavigation) {
      return; // Navigation is disabled
    }

    const newPath = currentPath === '/'
      ? `/${folderName}`
      : `${currentPath}/${folderName}`;

    setCurrentPath(newPath);
  }, [currentPath, allowNavigation]);

  const navigateToBreadcrumb = useCallback((index: number) => {
    if (!allowNavigation) {
      return; // Navigation is disabled
    }

    if (index === -1) {
      // Navigate to base path (not necessarily root)
      setCurrentPath(basePath);
      return;
    }

    const pathParts = currentPath.split('/').filter(Boolean);
    const basePathParts = basePath.split('/').filter(Boolean);

    // Ensure we don't navigate above the base path
    const targetIndex = Math.max(index, basePathParts.length - 1);
    const newPath = `/${pathParts.slice(0, targetIndex + 1).join('/')}`;

    // Ensure the new path is not above the base path
    if (newPath.startsWith(basePath) || basePath === '/') {
      setCurrentPath(newPath);
    }
  }, [currentPath, basePath, allowNavigation]);

  const handleEnvironmentChange = useCallback((event: React.ChangeEvent<{ value: unknown }>) => {
    if (!isEnvironmentLocked) {
      setSelectedEnvironment(event.target.value as string);
      setCurrentPath(basePath); // Reset to base path when changing environment
      setSecretValues({});
      setVisibleValues({});
      setLoadingSecretValues({});
    }
  }, [isEnvironmentLocked, basePath]);

  const getBreadcrumbs = useCallback(() => {
    const pathParts = currentPath.split('/').filter(Boolean);
    const basePathParts = basePath.split('/').filter(Boolean);

    // Determine which parts of the path are navigable (not below base path)
    const navigablePathParts = pathParts.slice(basePathParts.length);

    // Get the environment to display
    const selectedEnv = environments.find(env => env.slug === selectedEnvironment);

    return (
      <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />}>
        {/* Environment selector or chip */}
        {isEnvironmentLocked ? (
          <Chip
            label={selectedEnv?.name || selectedEnvironment}
            size="small"
            className={classes.environmentChip}
          />
        ) : (
          <FormControl className={classes.environmentSelect} size="small" variant="outlined">
            <Select
              value={selectedEnvironment || ''}
              onChange={handleEnvironmentChange}
              displayEmpty
              disabled={loadingEnvironments}
              IconComponent={ExpandMoreIcon}
            >
              {environments.length === 0 ? (
                <MenuItem value="" disabled>
                  No environments available
                </MenuItem>
              ) : (
                environments.map(env => (
                  <MenuItem key={env.slug} value={env.slug}>
                    {env.name}
                  </MenuItem>
                ))
              )}
            </Select>
          </FormControl>
        )}

        {/* Home/Base path button */}
        <Link
          component="button"
          variant="body2"
          className={allowNavigation ? classes.breadcrumbLink : classes.breadcrumbLinkDisabled}
          onClick={allowNavigation ? () => navigateToBreadcrumb(-1) : undefined}
          color={navigablePathParts.length === 0 ? "textPrimary" : "inherit"}
          style={{ pointerEvents: allowNavigation ? 'auto' : 'none' }}
        >
          <HomeIcon className={classes.homeIcon} />
          {basePath !== '/' && basePathParts[basePathParts.length - 1]}
        </Link>

        {/* Navigable path parts */}
        {navigablePathParts.map((part, index) => {
          const isLast = index === navigablePathParts.length - 1;

          return (
            <Link
              key={index}
              component="button"
              variant="body2"
              className={allowNavigation ? classes.breadcrumbLink : classes.breadcrumbLinkDisabled}
              onClick={allowNavigation ? () => navigateToBreadcrumb(basePathParts.length + index) : undefined}
              color={isLast ? "textPrimary" : "inherit"}
              style={{ pointerEvents: allowNavigation ? 'auto' : 'none' }}
            >
              {part}
            </Link>
          );
        })}
      </Breadcrumbs>
    );
  }, [
    classes.breadcrumbLink,
    classes.breadcrumbLinkDisabled,
    classes.environmentSelect,
    classes.environmentChip,
    classes.homeIcon,
    currentPath,
    basePath,
    environments,
    handleEnvironmentChange,
    isEnvironmentLocked,
    loadingEnvironments,
    navigateToBreadcrumb,
    selectedEnvironment,
    allowNavigation
  ]);

  const filterData = useCallback((data: TableItem[]) => {
    if (!searchText) return data;

    return data.filter(item => {
      if (item.isFolder && item.name) {
        return item.name.toLowerCase().includes(searchText.toLowerCase());
      }

      return (
        (item.secretKey && item.secretKey.toLowerCase().includes(searchText.toLowerCase())) ||
        (item.secretValue && item.secretValue.toLowerCase().includes(searchText.toLowerCase())) ||
        (item.secretComment && item.secretComment.toLowerCase().includes(searchText.toLowerCase()))
      );
    });
  }, [searchText]);

  const tableData: TableItem[] = [
    ...(folders || []).map(folder => ({
      ...folder,
      isFolder: true
    })),
    ...(secrets || [])
  ];

  const filteredData = filterData(tableData);

  const getEmptyStateMessages = useCallback(() => {
    if (!selectedEnvironment) {
      return {
        title: "Select an environment",
        description: "Please select an environment to view secrets and folders."
      };
    }

    if (searchText) {
      return {
        title: "No matching secrets or folders",
        description: "No items match your search filter."
      };
    }

    if (currentPath === basePath) {
      return {
        title: "No secrets or folders found",
        description: "This location doesn't have any secrets or folders yet. Create your first secret to get started."
      };
    }

    return {
      title: "Empty folder",
      description: "This folder doesn't have any secrets or subfolders yet."
    };
  }, [currentPath, basePath, selectedEnvironment, searchText]);

  const columns: TableColumn<TableItem>[] = [
    {
      title: 'Key',
      field: 'secretKey',
      highlight: true,
      render: rowData => {
        if (rowData.isFolder && rowData.name) {
          const isNavigationDisabled = !allowNavigation;
          
          return (
            <div
              className={isNavigationDisabled ? classes.folderNameDisabled : classes.folderName}
              onClick={isNavigationDisabled ? undefined : () => navigateToFolder(rowData.name!)}
              role={isNavigationDisabled ? undefined : "button"}
              tabIndex={isNavigationDisabled ? undefined : 0}
              onKeyPress={isNavigationDisabled ? undefined : (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  navigateToFolder(rowData.name!);
                }
              }}
              aria-label={isNavigationDisabled ? undefined : `Open ${rowData.name!} folder`}
              style={{ cursor: isNavigationDisabled ? 'default' : 'pointer' }}
            >
              <FolderIcon className={isNavigationDisabled ? classes.folderIconDisabled : classes.folderIcon} />
              <Typography variant="body2">{rowData.name!}</Typography>
            </div>
          );
        }
        return (
          <div className={classes.folderName}>
            <LockRoundedIcon className={classes.keyIcon} />
            <Typography variant="body2">{rowData.secretKey}</Typography>
          </div>
        );
      },
    },
    {
      title: 'Value',
      field: 'secretValue',
      render: rowData => {
        if (rowData.isFolder) {
          return null;
        }

        const isVisible = visibleValues[rowData.id] || false;
        const isLoading = loadingSecretValues[rowData.id] || false;
        const secretValue = secretValues[rowData.id] || '';

        return (
          <div className={classes.valueContainer}>
            <span className={classes.valueText}>
              {isLoading ? (
                'Loading...'
              ) : isVisible ? (
                secretValue
              ) : (
                '••••••••••••'
              )}
            </span>
            <IconButton
              size="small"
              onClick={() => toggleValueVisibility(rowData.id, rowData.secretKey)}
              aria-label={isVisible ? 'Hide value' : 'Show value'}
              disabled={isLoading}
            >
              {isLoading ? (
                <CircularProgress size={16} className={classes.loadingIconSmall} />
              ) : isVisible ? (
                <VisibilityOffIcon fontSize="small" />
              ) : (
                <VisibilityIcon fontSize="small" />
              )}
            </IconButton>
          </div>
        );
      },
    },
    {
      title: 'Comment',
      field: 'secretComment',
    },
    {
      title: 'Actions',
      width: '80px',
      render: rowData => {
        if (rowData.isFolder || rowData.readonly) {
          return null;
        }

        return (
          <div className={classes.actions}>
            <IconButton
              aria-label="edit"
              onClick={() => handleOpenDialog('edit', rowData as InfisicalSecret)}
              size="small"
              className={classes.actionButton}
            >
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton
              aria-label="delete"
              onClick={() => handleOpenDeleteDialog(rowData as InfisicalSecret)}
              size="small"
              color="secondary"
              className={classes.actionButton}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </div>
        );
      },
    },
  ];

  if (loadingEnvironments) {
    return <Progress />;
  }

  if (loading && selectedEnvironment) {
    return <Progress />;
  }

  if (error) {
    return <ErrorPanel error={error} />;
  }

  const emptyStateMessages = getEmptyStateMessages();

  return (
    <InfoCard title={cardTitle}>
      <div>
        {/* Combined top bar with environment dropdown/chip, breadcrumbs, search, and add button */}
        <div className={classes.topContainer}>
          <div className={classes.breadcrumbsContainer}>
            {getBreadcrumbs()}
          </div>
          <div className={classes.actionsContainer}>
            <div className={classes.searchContainer}>
              <div className={classes.searchIcon}>
                <SearchIcon />
              </div>
              <InputBase
                placeholder="Filter"
                classes={{
                  root: classes.inputRoot,
                  input: classes.inputInput,
                }}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                inputProps={{ 'aria-label': 'filter secrets' }}
              />
              {searchText && (
                <div
                  className={classes.clearIcon}
                  onClick={() => setSearchText('')}
                  role="button"
                  tabIndex={0}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setSearchText('');
                    }
                  }}
                >
                  <ClearIcon fontSize="small" />
                </div>
              )}
            </div>
            <Button
              variant="contained"
              color="primary"
              size="small"
              startIcon={<AddIcon />}
              onClick={() => handleOpenDialog('create')}
              className={classes.addButton}
              disabled={!selectedEnvironment}
            >
              ADD SECRET
            </Button>
          </div>
        </div>

        {/* Content table */}
        {!selectedEnvironment || filteredData.length === 0 ? (
          <Box mt={2}>
            <EmptyState
              missing="data"
              title={emptyStateMessages.title}
              description={emptyStateMessages.description}
            />
          </Box>
        ) : (
          <div className={classes.tableContainer}>
            <Table
              options={{
                paging: true,
                pageSize: 10,
                pageSizeOptions: [10, 20, 50],
                search: false,
                sorting: true,
                emptyRowsWhenPaging: false,
                padding: 'dense',
                actionsColumnIndex: -1,
                headerStyle: {
                  position: 'sticky',
                  top: 0,
                  zIndex: 1
                }
              }}
              columns={columns}
              data={filteredData}
              title=""
              components={{
                Toolbar: () => null
              }}
            />
          </div>
        )}

        {/* Create/Edit Secret Dialog */}
        <SecretDialog
          open={dialogOpen}
          mode={dialogMode}
          secret={selectedSecret}
          onClose={handleCloseDialog}
          onSave={handleSaveSecret}
          fetchSecretValue={fetchSecretValue}
        />

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onClose={handleCloseDeleteDialog}>
          <DialogTitle>Delete Secret</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Are you sure you want to delete the secret "{secretToDelete?.secretKey}"? This action cannot be undone.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDeleteDialog} color="primary">
              Cancel
            </Button>
            <Button onClick={handleConfirmDelete} color="secondary">
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      </div>
    </InfoCard>
  );
};