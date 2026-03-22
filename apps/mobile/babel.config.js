module.exports = function (api) {
  api.cache(true);
  // In this monorepo, babel-preset-expo (root node_modules) cannot resolve
  // expo-router (apps/mobile/node_modules), so hasModule('expo-router') returns
  // false and expoRouterBabelPlugin is never added. Add it explicitly so that
  // process.env.EXPO_ROUTER_APP_ROOT is replaced at transform time.
  const { expoRouterBabelPlugin } = require("babel-preset-expo/build/expo-router-plugin");
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [expoRouterBabelPlugin],
  };
};
