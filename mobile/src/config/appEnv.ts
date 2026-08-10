/**
 * M10 — the one place the app resolves which named environment it's
 * running as. Backed entirely by Expo's built-in `EXPO_PUBLIC_*` env var
 * support (Metro inlines any `process.env.EXPO_PUBLIC_*` reference at
 * bundle time — no new dependency, available since Expo SDK 49) reading
 * from `.env.development` / `.env.preview` / `.env.production` (see
 * `docs/M10_IMPLEMENTATION_NOTES.md` "Environment configuration" for
 * exactly how each of the three is loaded, locally and via EAS Build).
 */

export type AppEnvironment = 'development' | 'preview' | 'production';

const VALID_ENVIRONMENTS: AppEnvironment[] = ['development', 'preview', 'production'];

/**
 * Pure and exported (rather than reading `process.env`/`__DEV__`
 * internally) so it's directly unit-testable, same "logic is a pure
 * function, the module-level constant is just that function called
 * once" pattern used throughout this app.
 */
export function resolveAppEnvironment(rawEnvVar: string | undefined, isDev: boolean): AppEnvironment {
  if (rawEnvVar && (VALID_ENVIRONMENTS as string[]).includes(rawEnvVar)) {
    return rawEnvVar as AppEnvironment;
  }
  // Sane fallback if EXPO_PUBLIC_APP_ENV is ever missing (e.g. a build
  // profile that forgot to set it) — never crash on a missing env var,
  // just fall back to what `__DEV__` already tells us.
  return isDev ? 'development' : 'production';
}

export const appEnvironment: AppEnvironment = resolveAppEnvironment(process.env.EXPO_PUBLIC_APP_ENV, __DEV__);
