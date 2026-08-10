#!/usr/bin/env node
/**
 * Proposed telemetry-event extractor (parity: build-time "proposed events" scan).
 *
 * Scans the codebase for the marker comment
 *
 *     // @telemetry-proposed <event.name>   [optional free-text note]
 *
 * and writes a manifest of every proposed (not-yet-wired) telemetry event to
 * `telemetry-proposed-events.json` at the repo root. This lets us review a proposed event + its
 * intended dimensions BEFORE it is added to `EventDimensionsMap` in packages/utils/src/telemetry.ts
 * and emitted for real.
 *
 * Pure Node, no dependencies. Usage:
 *
 *     node scripts/extract-proposed-events.mjs           # writes the manifest
 *     npm run telemetry:extract-proposed                 # same, via package.json
 *
 * The manifest shape:
 *     {
 *       "generatedAt": "<iso>",
 *       "count": <n>,
 *       "events": [ { "name": "...", "note": "...", "file": "...", "line": <n> }, ... ]
 *     }
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const OUT = join(ROOT, "telemetry-proposed-events.json");

// Directories we never descend into.
const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  "dist",
  "build",
  "coverage",
  "generated",
]);
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

// `// @telemetry-proposed <name> [note]` — <name> is a real dotted event id (lowercase, e.g.
// `run.finished`); the rest is an optional note. Placeholder docs like `<name>` do NOT match, so the
// marker's own documentation is never collected as an event.
const MARKER = /\/\/\s*@telemetry-proposed\s+([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)\b\s*(.*)$/;

/** @param {string} dir @param {string[]} out */
function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (IGNORE_DIRS.has(entry)) continue;
      walk(full, out);
    } else if (EXTENSIONS.has(entry.slice(entry.lastIndexOf(".")))) {
      out.push(full);
    }
  }
}

function main() {
  const files = [];
  walk(ROOT, files);

  /** @type {{name:string,note:string,file:string,line:number}[]} */
  const events = [];
  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!text.includes("@telemetry-proposed")) continue; // fast reject
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      const m = MARKER.exec(line);
      if (m) {
        events.push({
          name: m[1],
          note: (m[2] || "").trim(),
          file: relative(ROOT, file),
          line: i + 1,
        });
      }
    });
  }

  events.sort((a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file));

  const manifest = {
    generatedAt: new Date().toISOString(),
    count: events.length,
    events,
  };
  writeFileSync(OUT, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`[telemetry] extracted ${events.length} proposed event(s) → ${relative(ROOT, OUT)}`);
}

main();
