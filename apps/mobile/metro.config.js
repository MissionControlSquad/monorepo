const { getDefaultConfig } = require("expo/metro-config");
const { mergeConfig } = require("metro");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const expoConfig = getDefaultConfig(projectRoot);

const config = mergeConfig(expoConfig, {
  watchFolders: [
    path.resolve(monorepoRoot, "packages/types"),
    path.resolve(monorepoRoot, "packages/utils"),
    path.resolve(monorepoRoot, "packages/config"),
    path.resolve(monorepoRoot, "packages/graphql-client"),
  ],
  resolver: {
    blockList: [
      ...Array.from(expoConfig.resolver.blockList ?? []),
      // Block symlinked @agentcenter packages in root node_modules (use packages/ directly instead)
      new RegExp(
        `^${escapeRegex(path.resolve(monorepoRoot, "node_modules/@agentcenter"))}.*`
      ),
      // Block graphql-client's own node_modules to avoid urql version conflicts
      new RegExp(
        `^${escapeRegex(path.resolve(monorepoRoot, "packages/graphql-client/node_modules"))}.*`
      ),
    ],
    extraNodeModules: {
      "@agentcenter/types": path.resolve(monorepoRoot, "packages/types"),
      "@agentcenter/utils": path.resolve(monorepoRoot, "packages/utils"),
      "@agentcenter/config": path.resolve(monorepoRoot, "packages/config"),
      "@agentcenter/graphql-client": path.resolve(monorepoRoot, "packages/graphql-client"),
      // Force single urql instance (root node_modules v4)
      "urql": path.resolve(monorepoRoot, "node_modules/urql"),
      "graphql": path.resolve(monorepoRoot, "node_modules/graphql"),
    },
  },
});

module.exports = withNativeWind(config, { input: "./global.css" });

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
