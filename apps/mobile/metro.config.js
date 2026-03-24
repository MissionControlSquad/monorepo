const { getDefaultConfig } = require("expo/metro-config");
const { mergeConfig } = require("metro");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

// Direct paths for all @agentcenter packages
const agentcenterPackages = {
  "@agentcenter/types": path.resolve(monorepoRoot, "packages/types"),
  "@agentcenter/utils": path.resolve(monorepoRoot, "packages/utils"),
  "@agentcenter/config": path.resolve(monorepoRoot, "packages/config"),
  "@agentcenter/graphql-client": path.resolve(monorepoRoot, "packages/graphql-client"),
  "@agentcenter/hooks": path.resolve(monorepoRoot, "packages/hooks"),
};

const expoConfig = getDefaultConfig(projectRoot);
const expoResolveRequest = expoConfig.resolver?.resolveRequest;

const config = mergeConfig(expoConfig, {
  watchFolders: [
    path.resolve(monorepoRoot, "packages/types"),
    path.resolve(monorepoRoot, "packages/utils"),
    path.resolve(monorepoRoot, "packages/config"),
    path.resolve(monorepoRoot, "packages/graphql-client"),
    path.resolve(monorepoRoot, "packages/hooks"),
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
      ...agentcenterPackages,
      // Force single urql instance (root node_modules v4)
      "urql": path.resolve(monorepoRoot, "node_modules/urql"),
      "graphql": path.resolve(monorepoRoot, "node_modules/graphql"),
    },
    // Explicit resolveRequest guarantees @agentcenter/* always resolves to packages/
    // regardless of blockList / nodeModulesPaths ordering in Metro 0.83.
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName.startsWith("@agentcenter/")) {
        const parts = moduleName.split("/");
        const pkgDir = agentcenterPackages[`@agentcenter/${parts[1]}`];
        if (pkgDir) {
          // Resolve the entry point from the package's exports or main field
          const pkg = require(path.join(pkgDir, "package.json"));
          const mainEntry = pkg.exports?.["."] ?? pkg.main ?? "src/index.ts";
          return {
            filePath: path.resolve(pkgDir, mainEntry),
            type: "sourceFile",
          };
        }
      }
      if (expoResolveRequest) {
        return expoResolveRequest(context, moduleName, platform);
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
});

module.exports = withNativeWind(config, { input: "./global.css" });

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
