/**
 * Base origin for the existing PharmDPrepped Netlify backend
 * (docs/MOBILE_MIGRATION_AUDIT.md §G). The mobile app is a separate
 * bundle from that Netlify site — unlike `index.html`'s own same-origin
 * relative `fetch('/api/...')` calls, every request from this app needs
 * an absolute URL.
 *
 * NOT YET SET to a real deployed origin. No live PharmDPrepped Netlify
 * URL has been provided to this project (see
 * docs/M8_IMPLEMENTATION_NOTES.md "Base URL" for the full note) — this
 * placeholder deliberately does not resolve, rather than guessing a
 * domain that might be wrong. Update this one constant once the real
 * origin is known; nothing else in `aiQuestionService.ts` needs to change.
 */
export const API_BASE_URL = 'https://REPLACE_WITH_DEPLOYED_PHARMDPREPPED_ORIGIN.example';
