/**
 * Component that displays breadcrumb navigation based on current path
 */

import React from 'react';
import {
    Breadcrumbs,
    Link,
    makeStyles,
    FormControl,
    Select,
    MenuItem,
} from '@material-ui/core';
import NavigateNextIcon from '@material-ui/icons/NavigateNext';
import HomeIcon from '@material-ui/icons/Home';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import { InfisicalEnvironment } from '../../api/types';

const useStyles = makeStyles(theme => ({
    breadcrumbsContainer: {
        display: 'flex',
        alignItems: 'center',
        flexGrow: 1,
    },
    breadcrumbLink: {
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        '&:hover': {
            textDecoration: 'underline',
        },
    },
    homeIcon: {
        fontSize: '1rem',
        marginRight: theme.spacing(0.5),
    },
    environmentSelect: {
        minWidth: '150px',
        marginRight: theme.spacing(1),
        '& .MuiSelect-root': {
            display: 'flex',
            alignItems: 'center',
        },
    },
}));

export interface PathBreadcrumbsProps {
    environments: InfisicalEnvironment[];
    selectedEnvironment: string | null;
    currentPath: string;
    loadingEnvironments: boolean;
    onEnvironmentChange: (event: React.ChangeEvent<{ value: unknown }>) => void;
    onNavigateToBreadcrumb: (index: number) => void;
}

export const PathBreadcrumbs: React.FC<PathBreadcrumbsProps> = ({
    environments,
    selectedEnvironment,
    currentPath,
    loadingEnvironments,
    onEnvironmentChange,
    onNavigateToBreadcrumb,
}) => {
    const classes = useStyles();
    const pathParts = currentPath.split('/').filter(Boolean);
    return (
        <div className={classes.breadcrumbsContainer}>
            <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />}>
                <FormControl className={classes.environmentSelect} size="small" variant="outlined">
                    <Select
                        value={selectedEnvironment || ''}
                        onChange={onEnvironmentChange}
                        displayEmpty
                        disabled={loadingEnvironments}
                        IconComponent={ExpandMoreIcon}
                    >
                        {!environments || environments?.length === 0 ? (
                            <MenuItem value="" disabled>
                                No environments available
                            </MenuItem>
                        ) : (
                            environments?.map(env => (
                                <MenuItem key={env.slug} value={env.slug}>
                                    {env.name}
                                </MenuItem>
                            ))
                        )}
                    </Select>
                </FormControl>
                <Link
                    component="button"
                    variant="body2"
                    className={classes.breadcrumbLink}
                    onClick={() => onNavigateToBreadcrumb(-1)}
                    color={pathParts?.length === 0 ? "textPrimary" : "inherit"}
                >
                    <HomeIcon className={classes.homeIcon} />
                </Link>

                {pathParts?.map((part, index) => {
                    const isLast = index === pathParts?.length - 1;

                    return (
                        <Link
                            key={index}
                            component="button"
                            variant="body2"
                            className={classes.breadcrumbLink}
                            onClick={() => onNavigateToBreadcrumb(index)}
                            color={isLast ? "textPrimary" : "inherit"}
                        >
                            {part}
                        </Link>
                    );
                })}
            </Breadcrumbs>
        </div>
    );
};