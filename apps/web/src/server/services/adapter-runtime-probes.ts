/**
 * Server-side wiring for the pure adapter detection hooks (§3 adapters). `packages/utils` keeps the
 * PARSE half of live model detection + Claude quota windows pure; the PROCESS-BOUND half lives here:
 *
 *  • Model probe — an injection-safe `execFile`-based probe (reuses `probeRuntimeBin` from
 *    ai-runtime-detect) registered via `setRuntimeModelProbe`, so `Adapter.detectModels` for
 *    claude/codex/gemini returns the CLI's live models. Gated behind MULTI_PROVIDER_ADAPTERS at the
 *    call site (the runtime-adapters query) — nothing is probed unless that flag is on.
 *
 *  • Claude usage reader — reads a known local usage file (best-effort) so the claude adapter's
 *    `getQuotaWindows` can shape real windows when one exists; absent → the explicit "unknown" window.
 *
 * Both installers are IDEMPOTENT and set the registry once, so calling them per-request is cheap.
 */
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { setRuntimeModelProbe, setClaudeUsageReader } from "@agentcenter/utils";
import { probeRuntimeBin } from "./ai-runtime-detect";

let modelProbeInstalled = false;
let usageReaderInstalled = false;

/**
 * Register the execFile-based model probe once. Injection-safe: the bin/args come from the pure
 * MODEL_PROBE_SPECS catalog, never user input. A non-zero exit still proves presence (probeRuntimeBin
 * returns installed:true), so a CLI whose `--help` exits non-zero is still probed.
 */
export function ensureAdapterModelProbe(): void {
  if (modelProbeInstalled) return;
  modelProbeInstalled = true;
  setRuntimeModelProbe(async (bin, args) => {
    const r = await probeRuntimeBin(bin, args);
    return { installed: r.installed, output: r.output };
  });
}

/**
 * Resolve the Claude usage-file path: explicit `CLAUDE_USAGE_FILE` /
 * `AGENTCENTER_CLAUDE_USAGE_FILE` override, else `~/.claude/usage.json`.
 */
function claudeUsageFilePath(): string {
  return (
    process.env.CLAUDE_USAGE_FILE ??
    process.env.AGENTCENTER_CLAUDE_USAGE_FILE ??
    join(homedir(), ".claude", "usage.json")
  );
}

/** Register the Claude usage-file reader once (best-effort; a missing file → null → "unknown" window). */
export function ensureClaudeUsageReader(): void {
  if (usageReaderInstalled) return;
  usageReaderInstalled = true;
  setClaudeUsageReader(async () => {
    try {
      return await readFile(claudeUsageFilePath(), "utf8");
    } catch {
      return null; // ENOENT (the common case) or any read error → treated as "no telemetry"
    }
  });
}
