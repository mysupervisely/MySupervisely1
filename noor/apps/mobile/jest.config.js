// jest-expo's preset already configures the correct transformIgnorePatterns
// for whatever Expo/React Native version is installed — overriding it with
// a hand-copied regex caused real breakage (untransformed ESM in
// @react-native/js-polyfills), so this file only adds what the preset
// doesn't already provide.
module.exports = {
  preset: "jest-expo",
  setupFiles: ["./jest.setup.js"],
};
