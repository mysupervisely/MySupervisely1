import { appEnvironment } from '../config/appEnv';

/**
 * Base origin for the existing PharmDPrepped Netlify backend
 * (docs/MOBILE_MIGRATION_AUDIT.md §G). The mobile app is a separate
 * bundle from that Netlify site — unlike `index.html`'s own same-origin
 * relative `fetch('/api/...')` calls, every request from this app needs
 * an absolute URL.
 *
 * M10: sourced from `EXPO_PUBLIC_API_BASE_URL` (set per environment via
 * `.env.development` / `.env.preview` / `.env.production`, or an EAS
 * Build profile's `env` — see docs/M10_IMPLEMENTATION_NOTES.md
 * "Environment configuration"), never hardcoded here. The per-environment
 * fallback below only matters if that variable is ever missing from a
 * build — it deliberately does not resolve to a real host, rather than
 * silently guessing a domain that might be wrong (same reasoning
 * documented since M8/M9, now applied per-environment instead of once).
 */
const FALLBACK_API_BASE_URL: Record<typeof appEnvironment, string> = {
  development: 'https://REPLACE_WITH_DEV_PHARMDPREPPED_ORIGIN.example',
  preview: 'https://REPLACE_WITH_PREVIEW_PHARMDPREPPED_ORIGIN.example',
  production: 'https://REPLACE_WITH_PRODUCTION_PHARMDPREPPED_ORIGIN.example',
};

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? FALLBACK_API_BASE_URL[appEnvironment];
