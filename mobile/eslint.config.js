// https://docs.expo.dev/guides/using-eslint/
// Written by hand rather than via `npx expo lint` — that command's
// auto-configure step calls api.expo.dev, which this environment's egress
// policy blocks (see docs/M1_IMPLEMENTATION_NOTES.md). The result is the
// same config `expo lint` would have generated.
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['dist/*'],
  },
];
