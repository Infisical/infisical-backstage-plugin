import { InputError } from '@backstage/errors';

/**
 * Normalizes a secret path to the form `/a/b` (leading slash, no trailing
 * slash, no empty segments). Rejects backslashes and `.` or `..` segments.
 *
 * @throws InputError when the path is not a string or attempts traversal
 * @public
 */
export function normalizeSecretPath(raw: string | undefined): string {
  if (raw === undefined || raw === null) {
    return '/';
  }
  if (typeof raw !== 'string') {
    throw new InputError('path must be a string');
  }
  if (raw.includes('\\')) {
    throw new InputError('path must not contain backslashes');
  }
  const segments = raw
    .trim()
    .split('/')
    .filter(segment => segment !== '');
  if (segments.some(segment => segment === '.' || segment === '..')) {
    throw new InputError('path must not contain relative segments');
  }
  return `/${segments.join('/')}`;
}

/**
 * The restriction expressed by an `infisical/secretPath` annotation.
 * @public
 */
export interface SecretPathRestriction {
  /** The normalized path the entity is restricted to */
  basePath: string;
  /** Whether subfolders of `basePath` are accessible too ("+" prefix) */
  allowSubfolders: boolean;
}

/**
 * Parses an `infisical/secretPath` annotation value.
 *
 * Without a "+" prefix only the exact path is accessible. With a "+" prefix
 * the path and all of its subfolders are accessible.
 *
 * @returns `undefined` when the annotation is unset or blank (no restriction)
 * @throws InputError when the path attempts traversal
 * @public
 */
export function parseSecretPathAnnotation(
  annotation: string | undefined,
): SecretPathRestriction | undefined {
  const trimmed = annotation?.trim();
  if (!trimmed) {
    return undefined;
  }
  const allowSubfolders = trimmed.startsWith('+');
  return {
    basePath: normalizeSecretPath(allowSubfolders ? trimmed.slice(1) : trimmed),
    allowSubfolders,
  };
}
