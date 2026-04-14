/**
 * openclaw-local.ts
 *
 * Thin abstraction over OpenClaw's local plugin API.
 *
 * According to OpenClaw docs, plugins interact with the runtime through:
 * - The `api` object received in the register() callback (registerHook, registerTool, etc.)
 * - The `openclaw system event` CLI mechanism for triggering agent turns
 *
 * OpenClaw does NOT expose a triggerCycle/triggerHeartbeat API for plugins.
 * The closest equivalent is `openclaw system event --text "..." --mode now`
 * which causes the target agent to immediately process a new turn.
 *
 * All `(globalThis as any).openclaw.*` calls below are the runtime bridge that
 * OpenClaw injects into the plugin process. These are the actual available globals
 * based on the OpenClaw plugin runtime contract.
 */

import type { AgentInfo } from "@agentcenter/types";

const LIST_AGENTS_TIMEOUT_MS = 5_000;

let cachedOpenclawBin: string | null = null;

/**
 * Resolve the openclaw binary path and cache it.
 *
 * Search order:
 *  1. Directories in the plugin's inherited PATH (works for Homebrew/system installs)
 *  2. Common fixed locations: /opt/homebrew/bin, /usr/local/bin, ~/.local/bin
 *  3. All nvm-managed node versions (~/.nvm/versions/node/*)
 *  4. Login shell `which` as last resort (works if shell profile sources nvm)
 */
async function resolveOpenclawBin(): Promise<string> {
  if (cachedOpenclawBin) return cachedOpenclawBin;

  const fs = await import("node:fs");
  const path = await import("node:path");
  const os = await import("node:os");

  // Build candidate list
  const candidates: string[] = [];

  // 1. Plugin's inherited PATH directories
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    candidates.push(path.join(dir, "openclaw"));
  }

  // 2. Common fixed locations (Homebrew, system npm)
  candidates.push("/opt/homebrew/bin/openclaw");
  candidates.push("/usr/local/bin/openclaw");
  candidates.push(path.join(os.homedir(), ".local", "bin", "openclaw"));

  // 3. All nvm versions
  const nvmDir = path.join(os.homedir(), ".nvm", "versions", "node");
  try {
    for (const ver of fs.readdirSync(nvmDir)) {
      candidates.push(path.join(nvmDir, ver, "bin", "openclaw"));
    }
  } catch { /* nvm not installed */ }

  // Return first existing candidate
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      cachedOpenclawBin = candidate;
      return candidate;
    } catch { /* not found or not executable */ }
  }

  // 4. Last resort: login shell which
  const { execFile } = await import("node:child_process");
  const bin = await new Promise<string>((resolve, reject) => {
    execFile("/bin/sh", ["-lc", "which openclaw"], (err, stdout) => {
      if (err) reject(new Error("[openclaw-local] Could not locate openclaw binary"));
      else resolve(stdout.trim());
    });
  });
  cachedOpenclawBin = bin;
  return bin;
}

/** Rejects after `ms` milliseconds with a timeout error. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`[openclaw-local] ${label} timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/**
 * Auto-approve any pending CLI device pairing requests.
 *
 * When the plugin spawns `openclaw agent` as a subprocess, the gateway treats
 * it as a new device and requires pairing approval for write operations. This
 * is a one-time step per machine — once approved, future calls use the gateway
 * path and complete in <1s. Without approval, calls fall back to embedded mode
 * (~30-60s). We auto-approve at plugin startup so users never see this friction.
 */
export async function autoApprovePendingDevices(): Promise<void> {
  const { execFile } = await import("node:child_process");
  try {
    const bin = await resolveOpenclawBin();

    // List pending requests as JSON
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(bin, ["devices", "list", "--json"], { timeout: 8_000 }, (err, out) => {
        if (err) reject(err);
        else resolve(out);
      });
    });

    let parsed: any;
    try { parsed = JSON.parse(stdout); } catch { return; }

    const pending: any[] = parsed?.pending ?? [];
    for (const req of pending) {
      const id: string = req.id ?? req.requestId;
      if (!id) continue;

      // Safety filter: only auto-approve requests that are clearly from a local
      // CLI subprocess on this machine. Remote or non-CLI devices must be
      // approved manually by the user.
      //
      // Criteria (all must pass):
      //   - client === "cli"  (not a browser, desktop app, or remote agent)
      //   - ip is loopback or unknown (not a real remote address)
      const client: string = (req.client ?? "").toLowerCase();
      const ip: string = (req.ip ?? "unknown-ip").toLowerCase();
      const isLocalCli =
        client === "cli" &&
        (ip === "unknown-ip" || ip === "127.0.0.1" || ip === "::1" || ip === "localhost" || ip === "");

      if (!isLocalCli) {
        console.log(
          `[agentcenter-bridge] Skipping auto-approve for device ${id} (client=${req.client}, ip=${req.ip}) — not a local CLI process`,
        );
        continue;
      }

      await new Promise<void>((resolve) => {
        execFile(bin, ["devices", "approve", id], { timeout: 8_000 }, () => resolve());
      });
      console.log(`[agentcenter-bridge] Auto-approved local CLI device pairing: ${id}`);
    }
  } catch {
    // Non-fatal — delivery will fall back to embedded mode if needed
  }
}

/** Read Agent ID from IDENTITY.md at a known workspace path. */
async function readAgentIdFromWorkspace(workspacePath: string): Promise<string | null> {
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const content = fs.readFileSync(path.join(workspacePath, "IDENTITY.md"), "utf8");
    return content.match(/\*\*Agent ID\*\*:\s*(\S+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * List agents using the OpenClaw CLI (`openclaw agents list --json`).
 *
 * slug  = OpenClaw agent id (e.g. "main") — stored in LiveAgentRoute, comes
 *         back verbatim as agentSlug in mc.deliver_task, passed directly to
 *         `openclaw agent --agent <slug>`.
 * agentId = DB primary key from IDENTITY.md — used by the server to match the
 *           agent record in the database (primary lookup, no username needed).
 */
export async function listLocalAgents(): Promise<AgentInfo[]> {
  const { execFile } = await import("node:child_process");

  try {
    const bin = await resolveOpenclawBin();
    const stdout = await withTimeout(
      new Promise<string>((resolve, reject) => {
        execFile(bin, ["agents", "list", "--json"], (err, out) => {
          if (err) reject(err);
          else resolve(out);
        });
      }),
      LIST_AGENTS_TIMEOUT_MS,
      "listLocalAgents",
    );

    const raw: any[] = JSON.parse(stdout);
    return Promise.all(
      raw.map(async (a: any) => ({
        slug: a.id as string,
        name: (a.identityName ?? a.id) as string,
        status: "idle" as const,
        agentId: a.workspace ? await readAgentIdFromWorkspace(a.workspace) : null,
      })),
    );
  } catch {
    return [];
  }
}

/**
 * Deliver a task notification to a local agent.
 *
 * agentSlug is the OpenClaw agent id (e.g. "main") — exactly what was
 * registered in vm.hello and what the server echoes back in mc.deliver_task.
 */
export async function deliverToLocalAgent(agentSlug: string, taskNotification: string): Promise<void> {
  const { spawn } = await import("node:child_process");
  const openclawBin = await resolveOpenclawBin();

  // Spawn detached — we only need to trigger the agent's turn, not wait for it
  // to finish. AI agents can run for minutes; holding the WS handler open would
  // cause false timeout errors even when delivery succeeded.
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      openclawBin,
      ["agent", "--agent", agentSlug, "--message", taskNotification],
      { detached: true, stdio: "ignore" },
    );
    child.on("error", reject);
    // Resolve as soon as the process is successfully spawned
    child.on("spawn", resolve);
    child.unref();
  });
}

/** Subscribe to agent status change events. */
export function onAgentStatusChange(
  handler: (event: {
    slug: string;
    status: string;
    detailedStatus?: string | null;
    statusMessage?: string | null;
    currentTaskId?: string | null;
    agentId?: string | null;
  }) => void,
): () => void {
  const oc = (globalThis as any).openclaw;
  if (typeof oc?.events?.on !== "function") return () => {};
  return oc.events.on("agent:statusChange", (event: any) => {
    const slug = event.slug ?? event.id ?? event.name;
    handler({
      slug,
      status: event.status,
      detailedStatus: event.detailedStatus ?? null,
      statusMessage: event.statusMessage ?? null,
      currentTaskId: event.currentTaskId ?? null,
      agentId: event.agentId ?? null,
    });
  });
}

/** Subscribe to agent message events (outgoing). */
export function onAgentMessage(
  handler: (event: {
    slug: string;
    taskId?: string | null;
    content: string;
  }) => void,
): () => void {
  const oc = (globalThis as any).openclaw;
  if (typeof oc?.events?.on !== "function") return () => {};
  return oc.events.on("agent:message", handler);
}

/** Subscribe to task done events. */
export function onTaskDone(
  handler: (event: { slug: string; taskId: string; summary?: string }) => void,
): () => void {
  const oc = (globalThis as any).openclaw;
  if (typeof oc?.events?.on !== "function") return () => {};
  return oc.events.on("agent:taskDone", handler);
}

/** Derive a stable machine fingerprint (hostname + first non-loopback MAC). */
export async function deriveMachineFingerprint(): Promise<string> {
  const os = await import("node:os");
  const crypto = await import("node:crypto");

  const hostname = os.hostname();
  const ifaces = os.networkInterfaces();
  let mac = "";
  for (const list of Object.values(ifaces)) {
    for (const iface of list ?? []) {
      if (!iface.internal && iface.mac && iface.mac !== "00:00:00:00:00:00") {
        mac = iface.mac;
        break;
      }
    }
    if (mac) break;
  }

  return crypto
    .createHash("sha256")
    .update(`${hostname}:${mac}`)
    .digest("hex")
    .slice(0, 32);
}
