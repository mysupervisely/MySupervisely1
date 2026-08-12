/**
 * Environment-specific API base URL (M5 brief §22). Expo inlines any
 * `EXPO_PUBLIC_*` variable at build time — set it per environment via a
 * `.env`/`.env.development`/`.env.staging`/`.env.production` file (see
 * docs/noor/M5-IMPLEMENTATION.md "Environments"); nothing is hard-coded
 * here beyond a local-dev fallback, and no production URL or secret is
 * committed. Anything in this file ships inside the app binary and must
 * be treated as discoverable by the end user — never put a secret here.
 *
 * On a physical device, `localhost` means the device itself, not your
 * dev machine — set EXPO_PUBLIC_API_URL to your machine's LAN IP (e.g.
 * `http://192.168.1.23:4000`) when testing on hardware. See
 * docs/noor/M5-IMPLEMENTATION.md "Physical-device instructions."
 */
export const API_URL = process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:4000";
