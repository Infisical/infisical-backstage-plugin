import { InputError } from '@backstage/errors';
import { normalizeSecretPath, parseSecretPathAnnotation } from './secretPath';

describe('normalizeSecretPath', () => {
  it.each([
    [undefined, '/'],
    ['', '/'],
    ['/', '/'],
    ['foo', '/foo'],
    ['/foo', '/foo'],
    ['/foo/', '/foo'],
    ['//foo', '/foo'],
    ['/foo//bar/', '/foo/bar'],
    ['  /foo ', '/foo'],
  ])('normalizes %p to %p', (input, expected) => {
    expect(normalizeSecretPath(input)).toBe(expected);
  });

  it.each(['/foo/../bar', '..', '/./foo', '/foo\\bar'])(
    'rejects traversal attempt %p',
    input => {
      expect(() => normalizeSecretPath(input)).toThrow(InputError);
    },
  );
});

describe('parseSecretPathAnnotation', () => {
  it.each([undefined, '', '   '])('returns undefined for %p', input => {
    expect(parseSecretPathAnnotation(input)).toBeUndefined();
  });

  it.each([
    ['/api', '/api'],
    ['api/', '/api'],
    [' /api ', '/api'],
  ])('restricts %p to exactly %p', (input, basePath) => {
    expect(parseSecretPathAnnotation(input)).toEqual({
      basePath,
      allowSubfolders: false,
    });
  });

  it.each([
    ['+/api', '/api'],
    ['+api/', '/api'],
    [' +/api', '/api'],
    ['+', '/'],
  ])('allows subfolders of %p under %p', (input, basePath) => {
    expect(parseSecretPathAnnotation(input)).toEqual({
      basePath,
      allowSubfolders: true,
    });
  });

  it('rejects traversal in the annotation', () => {
    expect(() => parseSecretPathAnnotation('+/api/..')).toThrow(InputError);
  });
});
