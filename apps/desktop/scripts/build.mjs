/**
 * esbuild bundler for the Electron main process and preload script.
 *
 * Bundles main.ts and preload.ts into self-contained CommonJS files under
 * dist-electron/. All npm dependencies (electron-log, electron-store,
 * electron-updater, …) are inlined — only `electron` itself stays external
 * since it is provided at runtime by the Electron binary.
 *
 * This eliminates the npm-workspaces hoisting issue: electron-builder no
 * longer needs to find production node_modules at packaging time.
 */

import * as esbuild from "esbuild";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const isProd = process.argv.includes("--prod");

/** Config shared by main + preload */
const base = {
  bundle: true,
  platform: "node",
  // Target the Node version shipped with Electron 35
  target: "node22",
  format: "cjs",
  // Only electron itself must remain external — everything else is bundled
  external: ["electron"],
  sourcemap: !isProd,
  minify: isProd,
  define: {
    "process.env.NODE_ENV": isProd ? '"production"' : '"development"',
  },
};

await Promise.all([
  esbuild.build({
    ...base,
    entryPoints: [resolve(root, "main.ts")],
    outfile: resolve(root, "dist-electron/main.js"),
  }),
  esbuild.build({
    ...base,
    entryPoints: [resolve(root, "preload.ts")],
    outfile: resolve(root, "dist-electron/preload.js"),
  }),
]);

console.log(`✓ Electron build complete (${isProd ? "production" : "development"})`);
