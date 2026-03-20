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
      new RegExp(
        `^${escapeRegex(path.resolve(monorepoRoot, "node_modules/@agentcenter"))}.*`
      ),
    ],
    extraNodeModules: {
      "@agentcenter/types": path.resolve(monorepoRoot, "packages/types"),
      "@agentcenter/utils": path.resolve(monorepoRoot, "packages/utils"),
      "@agentcenter/config": path.resolve(monorepoRoot, "packages/config"),
      "@agentcenter/graphql-client": path.resolve(monorepoRoot, "packages/graphql-client"),
    },
  },
});

module.exports = withNativeWind(config, { input: "./global.css" });

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
