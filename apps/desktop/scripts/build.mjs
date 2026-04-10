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
import { rmSync, mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const outDir = resolve(root, "dist-electron");

const isProd = process.argv.includes("--prod");

// ── Clean output directory before every build ────────────────────────────
// Prevents stale files from a previous build ending up in the packaged app.
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

/** Config shared by main + preload */
const base = {
  bundle: true,
  platform: "node",
  // Target the Node version shipped with Electron 35
  target: "node22",
  format: "cjs",
  // Only electron itself must remain external — everything else is bundled.
  // electron-store v8 is ESM-only; esbuild's mainFields resolution handles
  // ESM→CJS conversion automatically when format is "cjs".
  external: ["electron"],
  sourcemap: isProd ? false : "inline",
  minify: isProd,
  define: {
    "process.env.NODE_ENV": isProd ? '"production"' : '"development"',
  },
  // Surface individual bundle warnings as errors in CI
  logLevel: "warning",
};

const start = Date.now();

try {
  await Promise.all([
    esbuild.build({
      ...base,
      entryPoints: [resolve(root, "main.ts")],
      outfile: resolve(outDir, "main.js"),
    }),
    esbuild.build({
      ...base,
      entryPoints: [resolve(root, "preload.ts")],
      outfile: resolve(outDir, "preload.js"),
    }),
  ]);
} catch (err) {
  // esbuild already prints formatted diagnostics; just set exit code
  process.exit(1);
}

const elapsed = ((Date.now() - start) / 1000).toFixed(2);
console.log(
  `✓ Electron build complete (${isProd ? "production" : "development"}) in ${elapsed}s`
);
