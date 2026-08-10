import { resolveAppEnvironment } from './appEnv';

describe('resolveAppEnvironment', () => {
  test('uses a valid EXPO_PUBLIC_APP_ENV value as-is', () => {
    expect(resolveAppEnvironment('development', true)).toBe('development');
    expect(resolveAppEnvironment('preview', true)).toBe('preview');
    expect(resolveAppEnvironment('production', false)).toBe('production');
  });

  test('falls back to development when unset and running in dev mode', () => {
    expect(resolveAppEnvironment(undefined, true)).toBe('development');
  });

  test('falls back to production when unset and NOT running in dev mode', () => {
    expect(resolveAppEnvironment(undefined, false)).toBe('production');
  });

  test('an unrecognized value falls back the same way an unset one does, rather than crashing', () => {
    expect(resolveAppEnvironment('staging-typo', true)).toBe('development');
    expect(resolveAppEnvironment('staging-typo', false)).toBe('production');
  });

  test('an empty string is treated as unset', () => {
    expect(resolveAppEnvironment('', true)).toBe('development');
  });
});
