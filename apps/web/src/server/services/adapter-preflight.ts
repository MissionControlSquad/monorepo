/**
 * Adapter environment preflight ("Test connection") — Paperclip parity.
 *
 * Verifies a runtime adapter is INSTALLED + REACHABLE + AUTHENTICATED on this host BEFORE a run is
 * dispatched, returning the structured {@link AdapterPreflightResult} the GraphQL layer + UI render as
 * green/red check rows. The probe is injection-safe: it spawns `<binName> --version` with `execFile`
 * (no shell) and the bin name comes from the built-in adapter registry (never user input). It reuses
 * the shared `probeRuntimeBin` detection helper (see ai-runtime-detect.ts) rather than duplicating it.
 *
 * ## How to test (manual, in the app)
 *   1. Turn ON the `multi_provider_adapters` feature flag for your workspace.
 *   2. Sign in as an admin (owner/admin) and open `/adapters`.
 *   3. Click "Test connection" on any adapter card.
 *   4a. INSTALLED CLI (e.g. `claude` on PATH): the three rows go green —
 *       "CLI installed" (found + version), "Reachable" (responded to --version),
 *       "Authenticated" (no auth error detected).
 *   4b. MISSING CLI (e.g. `gemini` not installed): "CLI installed" + "Reachable" +
 *       "Authenticated" go red with readable reasons ("gemini was not found on PATH…").
 *   4c. Generic/remote adapter (process / shell / http / hermes-gateway): a single green row
 *       explains there is no local CLI to probe — the connection is verified when a task runs.
 *   Member (non-admin) or flag OFF ⇒ the query is rejected (the button is not shown to members).
 */
import {
  getAdapter,
  summarizePreflight,
  classifyErrorFamily,
  type AdapterPreflightCheck,
  type AdapterPreflightContext,
  type AdapterPreflightResult,
} from "@agentcenter/utils";
import { probeRuntimeBin } from "./ai-runtime-detect";

/**
 * Run the environment preflight for a runtime adapter identified by `key` (canonicalized through the
 * registry aliases). Never throws — every failure mode is shaped into checks so the UI always has
 * something readable to render.
 */
export async function adapterPreflight(
  key: string,
  ctx: AdapterPreflightContext = {},
): Promise<AdapterPreflightResult> {
  const adapter = getAdapter(key);
  if (!adapter) {
    return summarizePreflight([
      {
        name: "Adapter",
        ok: false,
        detail: `Unknown runtime adapter "${key}". It may be disabled or misconfigured.`,
      },
    ]);
  }

  // An adapter that declares its own preflight owns the check entirely (Paperclip parity seam).
  if (adapter.testEnvironment) {
    try {
      return await adapter.testEnvironment(ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return summarizePreflight([
        { name: "Preflight", ok: false, detail: `The runtime preflight failed to run: ${message}` },
      ]);
    }
  }

  // Generic / remote adapters (process, shell, http, hermes-gateway) have no local CLI binary to probe.
  if (!adapter.binName) {
    return summarizePreflight([
      {
        name: "Runtime",
        ok: true,
        detail: `${adapter.displayName} has no local CLI to probe (generic/remote adapter). Its connection is verified when a task actually runs.`,
      },
    ]);
  }

  const bin = adapter.binName;
  const { installed, version, output } = await probeRuntimeBin(bin, ["--version"]);

  // When the CLI IS installed, classify its --version output for an auth complaint (some CLIs refuse to
  // report a version until you sign in). transient_upstream is benign telemetry → ignore it here.
  const family = installed ? classifyErrorFamily(output) : undefined;
  const authFailed = family === "auth_required";

  const checks: AdapterPreflightCheck[] = [
    {
      name: "CLI installed",
      ok: installed,
      detail: installed
        ? `Found ${bin}${version ? ` (${version})` : ""} on PATH.`
        : `${bin} was not found on PATH. Install the ${adapter.displayName} CLI on this host, then retry.`,
    },
    {
      name: "Reachable",
      ok: installed,
      detail: installed
        ? version
          ? `${bin} responded to --version (${version}).`
          : `${bin} responded to --version.`
        : `Can't reach ${bin} until it is installed.`,
    },
    {
      name: "Authenticated",
      ok: installed && !authFailed,
      detail: !installed
        ? `Sign-in can't be checked until the CLI is installed.`
        : authFailed
          ? `${adapter.displayName} reports it is not signed in. Run its login command on this host, then retry.`
          : `No authentication error detected. A live task run fully verifies credentials.`,
    },
  ];

  // Only surface a machine-readable family for a real, classifiable failure (auth today).
  const errorFamily = authFailed ? family : undefined;
  return summarizePreflight(checks, errorFamily);
}
