/**
 * Ad-hoc code signing for local macOS builds.
 *
 * macOS 13+ (and strictly enforced on macOS 26 / Tahoe) requires that the
 * Electron Framework and the host app binary share the same Team ID. When
 * building without a Developer ID certificate we must re-sign EVERY component
 * with the same ad-hoc identity ("-") so they all have Team ID = "".
 *
 * The sequence matters:
 *   1. Inner binaries inside the Electron Framework (Versions/A/…)
 *   2. The Electron Framework itself
 *   3. All remaining helper .app bundles
 *   4. The outer AgentCenter.app last
 *
 * Usage (called automatically by the package:mac:local npm script):
 *   node scripts/sign-local.mjs
 */

import { execSync } from "child_process";
import { existsSync, readdirSync, statSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ── Locate the built .app ─────────────────────────────────────────────────
function findApp() {
  for (const dir of ["release/mac-universal", "release/mac-arm64", "release/mac"]) {
    const candidate = join(root, dir, "AgentCenter.app");
    if (existsSync(candidate)) return candidate;
  }
  // Fallback: search release/ recursively one level
  const releaseDir = join(root, "release");
  if (!existsSync(releaseDir)) return null;
  for (const entry of readdirSync(releaseDir)) {
    const candidate = join(releaseDir, entry, "AgentCenter.app");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const appPath = findApp();
if (!appPath) {
  console.error("✗ Could not find AgentCenter.app in release/");
  process.exit(1);
}

console.log(`Signing: ${appPath}`);

function sign(target) {
  if (!existsSync(target)) return;
  try {
    execSync(
      `codesign --force --sign - --timestamp=none --options=0 "${target}"`,
      { stdio: "pipe" }
    );
  } catch (e) {
    // stderr has the useful message
    console.warn(`  ⚠ codesign warning for ${target}: ${e.stderr?.toString().trim()}`);
  }
}

// Remove quarantine so macOS doesn't block the app on first launch
execSync(`xattr -cr "${appPath}"`, { stdio: "inherit" });

// ── Sign inner binaries in the Electron Framework first ───────────────────
const frameworksDir = join(appPath, "Contents", "Frameworks");

if (existsSync(frameworksDir)) {
  for (const entry of readdirSync(frameworksDir)) {
    const frameworkPath = join(frameworksDir, entry);

    if (entry === "Electron Framework.framework") {
      // Sign the inner Electron binary first, then the framework bundle
      const innerBin = join(frameworkPath, "Versions", "A", "Electron Framework");
      sign(innerBin);

      // Sign any dylibs / helpers inside the framework
      const versionsA = join(frameworkPath, "Versions", "A");
      if (existsSync(versionsA)) {
        for (const f of readdirSync(versionsA)) {
          const fp = join(versionsA, f);
          if (statSync(fp).isFile() && !f.startsWith(".")) {
            sign(fp);
          }
        }
      }

      sign(frameworkPath);
    } else if (entry.endsWith(".app")) {
      // Helper apps (Electron Helper, GPU, Renderer, Plugin)
      execSync(`codesign --force --deep --sign - --timestamp=none "${frameworkPath}"`, {
        stdio: "pipe",
      });
    } else if (entry.endsWith(".dylib") || entry.endsWith(".framework")) {
      sign(frameworkPath);
    }
  }
}

// ── Sign the main app bundle ──────────────────────────────────────────────
execSync(
  `codesign --force --deep --sign - --timestamp=none "${appPath}"`,
  { stdio: "inherit" }
);

console.log("✓ Ad-hoc signing complete");
console.log(`\nTo install: open "${appPath}"`);
