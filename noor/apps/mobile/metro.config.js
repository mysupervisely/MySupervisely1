// Metro config for a pnpm monorepo — pnpm's node_modules are symlink-heavy
// (a workspace package like @noor/types isn't hoisted into a flat
// node_modules the way npm/yarn classic would), so Metro needs explicit
// help finding both the workspace root and following symlinks. See
// docs/noor/M5-IMPLEMENTATION.md "Mobile architecture."
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch the whole workspace (so edits to @noor/types are picked up)
// without bundling anything outside it.
config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.unstable_enableSymlinks = true;
// Hierarchical lookup must stay ENABLED (the Expo/Metro default) in a
// pnpm monorepo: pnpm nests each package's real dependencies (e.g.
// expo-modules-core, a dependency of expo itself, not of @noor/mobile
// directly) inside that package's own symlinked node_modules under the
// pnpm store, reachable only by Metro walking up from the importing
// file the normal Node way. Disabling it (as this file previously did,
// to be "extra explicit" about pnpm's non-flat layout) instead broke
// resolution of anything not hoisted into the two directories listed in
// nodeModulesPaths above — confirmed by `npx expo export --platform ios`
// failing with "Unable to resolve module expo-modules-core" and by
// `npx expo-doctor` independently flagging this exact override against
// its recommended defaults. See docs/noor/M5-IMPLEMENTATION.md "Device
// verification."

module.exports = config;
