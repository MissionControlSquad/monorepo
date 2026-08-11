/**
 * Live model detection for local-CLI runtimes (§3 adapters — concrete `detectModels`).
 *
 * The `Adapter.detectModels?` hook is meant to shell out to a runtime's installed CLI and list the
 * models it actually offers, so `resolveAdapterModels` can surface curated ∪ live. But `packages/utils`
 * is PURE (no `child_process`), so the process-bound probe is INJECTED: the server (apps/web) registers
 * an injection-safe `execFile`-based probe via {@link setRuntimeModelProbe}; the parse of the probe's
 * output into model ids is the pure, fixture-testable half kept here.
 *
 * BEST-EFFORT + HONEST: none of claude/codex/gemini ships a guaranteed machine-readable "list models"
 * command, so the probe runs the CLI's help/list output and extracts tokens that look like that
 * runtime's model ids (a token matching the runtime's model-id shape AND containing a digit, to avoid
 * false positives like a bare "claude"/"codex"). When the CLI is absent or emits nothing recognizable,
 * detection returns [] and `resolveAdapterModels` falls back to the curated `models` list unchanged.
 */

/** An injection-safe probe: run `<bin> <args>` and return whether it exists + its combined output. */
export type RuntimeModelProbe = (
  bin: string,
  args: string[],
) => Promise<{ installed: boolean; output: string }>;

/** How to probe one runtime's CLI for its model ids: which binary/args to run + how to recognize models. */
export interface ModelProbeSpec {
  bin: string;
  /** Fixed args (never user input) — injection-safe with execFile (no shell). */
  args: string[];
  /** Matches this runtime's model-id token shape. MUST carry the global flag. */
  pattern: RegExp;
}

/**
 * Per-runtime probe specs. Args are a fixed `--help`/list invocation (best-effort: these CLIs have no
 * stable "list models" command, so we scan their help output). The pattern is the runtime's model-id
 * shape; `parseDetectedModels` additionally requires a digit so structural words are not mistaken for
 * models.
 */
export const MODEL_PROBE_SPECS: Record<"claude" | "codex" | "gemini", ModelProbeSpec> = {
  claude: { bin: "claude", args: ["--help"], pattern: /claude-[a-z0-9][a-z0-9._-]*/gi },
  codex: {
    bin: "codex",
    args: ["--help"],
    pattern: /(?:gpt-[a-z0-9][\w.-]*|o[0-9](?:-[\w.-]+)?|codex-[\w.-]+)/gi,
  },
  gemini: { bin: "gemini", args: ["--help"], pattern: /gemini-[a-z0-9][a-z0-9._-]*/gi },
};

const MAX_MODELS = 50;

/**
 * PURE: extract model ids from a CLI's probe output. Matches the runtime's model-id `pattern`, keeps
 * only tokens that contain a digit (models are versioned; this drops bare structural words), lowercases
 * for stable dedup, preserves first-seen order, and caps the count. Never throws.
 */
export function parseDetectedModels(output: string, pattern: RegExp): string[] {
  if (!output) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of output.matchAll(pattern)) {
    const token = match[0].trim().toLowerCase().replace(/[.,;:]+$/, "");
    if (!/[0-9]/.test(token)) continue; // require a version digit — drops "claude"/"codex" bare words
    if (token.length > 80 || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
    if (out.length >= MAX_MODELS) break;
  }
  return out;
}

// ── Injected probe registry ──────────────────────────────────────────────────
// The pure package cannot spawn a process; the server sets a real probe here once. Default: no probe →
// detection returns [] → curated-only (the safe, unchanged behavior everywhere the server hasn't wired it).

let activeProbe: RuntimeModelProbe | null = null;

/** Register (or clear with null) the process-bound model probe. Called once by the server at startup. */
export function setRuntimeModelProbe(probe: RuntimeModelProbe | null): void {
  activeProbe = probe;
}

/** The currently-registered probe (mostly for tests/introspection). */
export function getRuntimeModelProbe(): RuntimeModelProbe | null {
  return activeProbe;
}

/**
 * Detect the live models a runtime's CLI offers, via the injected probe (default: the registered one).
 * Returns [] when no probe is registered, the CLI is absent, or nothing recognizable is found — so the
 * caller ({@link resolveAdapterModels}) transparently falls back to the curated list. Never throws.
 */
export async function detectModelsForKey(
  key: keyof typeof MODEL_PROBE_SPECS,
  probe: RuntimeModelProbe | null = activeProbe,
): Promise<string[]> {
  const spec = MODEL_PROBE_SPECS[key];
  if (!spec || !probe) return [];
  let res: { installed: boolean; output: string };
  try {
    res = await probe(spec.bin, spec.args);
  } catch {
    return [];
  }
  if (!res.installed) return [];
  return parseDetectedModels(res.output, spec.pattern);
}
