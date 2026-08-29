/**
 * Detect which AI coding-agent CLIs are installed on a machine, and pair each with its install help.
 *
 * LOCAL detection runs the probe on the host the web/runner process is on (macOS / Linux / Windows).
 * The bin names come from the pure catalog (AI_RUNTIME_TOOLS) - never user input - so probing with
 * execFile (no shell) is injection-safe. A REMOTE machine reports its own probe results via the runner
 * endpoint (POST /api/runner/ai-tools) using this same shape, so local and remote render identically.
 */
import { execFile } from "node:child_process";
import {
  AI_RUNTIME_TOOLS,
  NODE_PREREQ,
  osFromPlatform,
  installMethodsFor,
  needsNode,
  type RuntimeOs,
  type InstallMethod,
} from "@agentcenter/utils";

export interface RuntimeToolStatus {
  key: string;
  displayName: string;
  binName: string;
  summary: string;
  docsUrl: string;
  installed: boolean;
  version: string | null;
  /** Whether any install method for this OS needs Node.js first (and Node is missing). */
  needsNode: boolean;
  /** Ordered install help for the target OS (recommended first). */
  installMethods: InstallMethod[];
}

export interface RuntimeInventory {
  os: RuntimeOs;
  nodeInstalled: boolean;
  nodeVersion: string | null;
  /** Node install help for this OS (shown when a tool needs Node but it is absent). */
  nodeInstall: InstallMethod[];
  nodeDocsUrl: string;
  tools: RuntimeToolStatus[];
}

const VERSION_RE = /\d+\.\d+(?:\.\d+)?[\w.+-]*/;

/** The outcome of probing one runtime binary — presence, a parsed version, and the raw combined output. */
export interface RuntimeProbeResult {
  installed: boolean;
  version: string | null;
  /** Combined stdout+stderr (trimmed) — used by callers that classify auth/error text. */
  output: string;
}

/**
 * Probe one binary by running `<bin> <args>` WITHOUT a shell (injection-safe: bin/args come from a
 * pure catalog, never user input). ENOENT -> not installed. Otherwise installed (a non-zero exit still
 * proves presence). Shared by the runtime inventory below AND the adapter preflight service, so the
 * single detection pattern is never duplicated.
 */
export function probeRuntimeBin(bin: string, args: string[]): Promise<RuntimeProbeResult> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: 6000, windowsHide: true }, (err, stdout, stderr) => {
      const e = err as NodeJS.ErrnoException | null;
      const out = `${stdout ?? ""}${stderr ?? ""}`.trim();
      if (e && e.code === "ENOENT") return resolve({ installed: false, version: null, output: out });
      const m = out.match(VERSION_RE);
      resolve({
        installed: true,
        version: m ? m[0] : out ? out.split("\n")[0].slice(0, 60) : null,
        output: out,
      });
    });
  });
}

/** Detect every catalog tool + the Node prerequisite on the local host. */
export async function detectLocalRuntimes(
  os: RuntimeOs = osFromPlatform(process.platform),
): Promise<RuntimeInventory> {
  const node = await probeRuntimeBin(NODE_PREREQ.binName, NODE_PREREQ.versionArgs);
  const tools = await Promise.all(
    AI_RUNTIME_TOOLS.map(async (t): Promise<RuntimeToolStatus> => {
      const r = await probeRuntimeBin(t.binName, t.versionArgs);
      return {
        key: t.key,
        displayName: t.displayName,
        binName: t.binName,
        summary: t.summary,
        docsUrl: t.docsUrl,
        installed: r.installed,
        version: r.version,
        needsNode: needsNode(t, os) && !node.installed,
        installMethods: installMethodsFor(t, os),
      };
    }),
  );
  return {
    os,
    nodeInstalled: node.installed,
    nodeVersion: node.version,
    nodeInstall: installMethodsFor(NODE_PREREQ, os),
    nodeDocsUrl: NODE_PREREQ.docsUrl,
    tools,
  };
}
