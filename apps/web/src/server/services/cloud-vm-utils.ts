/**
 * Shared utilities for Cloud VM operations.
 *
 * Centralises repeated patterns (SSH config, agent slug, config R/W,
 * gateway restart, agent list parsing) so every consumer uses the same logic.
 */

import { sshExec, sshExecStream, sshUploadFile, type SSHConfig } from "./ssh";
import { decryptPrivateKey } from "./ssh-keys";
import { env } from "../env";
import { findAgentsByVMId, updateAgent } from "@agentcenter/database";
import { generateApiKey } from "../api-key";
import { generateAgentConfig, getMcUrl } from "../agent-config-generator";
import { VM_CONFIG_PATH, VM_WORKSPACE, VM_USER, OPENCLAW_CMD_PREFIX } from "./cloud-vm-paths";
import { AgentLevel } from "../constants";
import { getAgentSlug } from "@agentcenter/utils";

// ─── OpenClaw CLI ───────────────────────────────────────────────────

/**
 * Run an `openclaw` CLI command on the VM with the correct HOME.
 * SSH connects as root, but the openclaw config lives under VM_USER's home.
 * This ensures the CLI finds gateway.remote.token and other config.
 */
export function ocExec(sshConfig: SSHConfig, command: string, opts?: { timeoutMs?: number }) {
  // Run as the agentcenter user (not root) so any files created (e.g. identity/device.json)
  // are owned by agentcenter and readable by the gateway service.
  return sshExec(sshConfig, `sudo -u ${VM_USER} ${OPENCLAW_CMD_PREFIX} ${command}`, opts);
}

/** Streaming variant of ocExec for long-running openclaw commands. */
export function ocExecStream(
  sshConfig: SSHConfig,
  command: string,
  onData: (chunk: string) => void,
  onStderr?: (chunk: string) => void,
) {
  return sshExecStream(
    sshConfig,
    `sudo -u ${VM_USER} ${OPENCLAW_CMD_PREFIX} ${command}`,
    onData,
    onStderr,
  );
}

// ─── SSH Config ─────────────────────────────────────────────────────

/** Decrypt private key and build an SSHConfig for a VM. */
export function getVMSSHConfig(vm: {
  ipv4: string | null;
  sshPrivateKey: string | null;
}): SSHConfig {
  if (!vm.ipv4) throw new Error("VM has no IP address");
  if (!vm.sshPrivateKey) throw new Error("No SSH private key stored for this VM");
  const privateKey = env.SSH_KEY_ENCRYPTION_SECRET
    ? decryptPrivateKey(vm.sshPrivateKey, env.SSH_KEY_ENCRYPTION_SECRET)
    : vm.sshPrivateKey;
  return { host: vm.ipv4, privateKey };
}

// ─── Workspace Paths ────────────────────────────────────────────────

/** Absolute path to an agent's workspace on the VM. */
export function agentWorkspacePath(agentSlug: string): string {
  return `${VM_WORKSPACE}/${agentSlug}`;
}

// ─── Gateway Polling ─────────────────────────────────────────────────

/**
 * Poll `systemctl is-active openclaw` until it reports "active".
 * Optionally verify a specific agent is registered before returning true.
 */
export async function waitForGateway(
  sshConfig: SSHConfig,
  opts?: { maxAttempts?: number; intervalMs?: number; expectAgent?: string },
): Promise<boolean> {
  const maxAttempts = opts?.maxAttempts ?? 15;
  const intervalMs = opts?.intervalMs ?? 1_000;

  for (let i = 0; i < maxAttempts; i++) {
    const check = await sshExec(sshConfig, "systemctl is-active openclaw", { timeoutMs: 10_000 });
    if (check.stdout.trim() === "active") {
      if (!opts?.expectAgent) return true;

      // Additionally verify the agent is visible
      const registered = await isAgentRegistered(sshConfig, opts.expectAgent);
      if (registered) return true;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

// ─── Gateway Restart ────────────────────────────────────────────────

/**
 * Restart the OpenClaw gateway and poll until it's confirmed active.
 * Optionally verify a specific agent is registered before returning true.
 */
export async function restartGateway(
  sshConfig: SSHConfig,
  opts?: { expectAgent?: string },
): Promise<boolean> {
  const result = await sshExec(sshConfig, "systemctl restart openclaw", { timeoutMs: 30_000 });
  if (result.code !== 0) return false;
  return waitForGateway(sshConfig, { expectAgent: opts?.expectAgent });
}

// ─── Agent List ─────────────────────────────────────────────────────

export interface VMAgent {
  id: string;
  name: string;
  workspace?: string;
}

/** Run `openclaw agents list --json` and parse the result. */
export async function listAgentsOnVM(sshConfig: SSHConfig): Promise<VMAgent[]> {
  const result = await ocExec(sshConfig, "openclaw agents list --json 2>/dev/null || echo '[]'", {
    timeoutMs: 15_000,
  });
  try {
    const parsed = JSON.parse(result.stdout.trim());
    const list = Array.isArray(parsed) ? parsed : parsed.agents || [];
    return list.map((a: Record<string, unknown>) => ({
      id: (a.id || a.agentId || a.name) as string,
      name: (a.name || a.id || a.agentId) as string,
      workspace: a.workspace as string | undefined,
    }));
  } catch {
    return [];
  }
}

/** Check if a specific agent slug is registered in OpenClaw on the VM. */
export async function isAgentRegistered(sshConfig: SSHConfig, agentSlug: string): Promise<boolean> {
  const agents = await listAgentsOnVM(sshConfig);
  return agents.some((a) => a.id === agentSlug || a.name === agentSlug);
}

// ─── VM Config (openclaw.json) ──────────────────────────────────────

/** Read and parse openclaw.json from the VM. Returns empty object on failure. */
export async function readVMConfig(sshConfig: SSHConfig): Promise<Record<string, unknown>> {
  const result = await sshExec(sshConfig, `cat ${VM_CONFIG_PATH}`, { timeoutMs: 10_000 });
  if (result.code === 0) {
    try {
      return JSON.parse(result.stdout);
    } catch {
      // unparseable
    }
  }
  return {};
}

/**
 * Write openclaw.json to the VM (mode 600, owned by agentcenter user).
 * Uses atomic write (upload to temp → mv) so openclaw's hot-reloader
 * never sees a truncated/empty file.
 */
export async function writeVMConfig(
  sshConfig: SSHConfig,
  config: Record<string, unknown>,
): Promise<void> {
  const tmpPath = `${VM_CONFIG_PATH}.tmp`;
  await sshUploadFile(sshConfig, tmpPath, JSON.stringify(config, null, 2), 0o600);
  await sshExec(
    sshConfig,
    `chown ${VM_USER}:${VM_USER} ${tmpPath} && mv ${tmpPath} ${VM_CONFIG_PATH}`,
  );
}

// ─── Cron Index ─────────────────────────────────────────────────────

/**
 * Compute the 0-based cron index for an agent by sorting all agents on the VM
 * alphabetically by slug. This replaces 5 inconsistent methods across the codebase.
 *
 * @param vmId - The Cloud VM ID
 * @param agentSlug - The agent slug to find the index for
 * @param preloadedAgents - Optional pre-loaded agents list (avoids extra DB query)
 */
export async function computeAgentCronIndex(
  vmId: string,
  agentSlug: string,
  preloadedAgents?: { username?: string | null; name: string }[],
): Promise<number> {
  const agents = preloadedAgents ?? (await findAgentsByVMId(vmId));

  const slugs = agents.map((a) => getAgentSlug(a)).sort();
  const index = slugs.indexOf(agentSlug);
  return index >= 0 ? index : slugs.length;
}

// ─── Required Agent Files (F) ───────────────────────────────────────

/** Single source of truth for required agent config files. */
export const REQUIRED_AGENT_FILES = [
  "IDENTITY.md",
  "HEARTBEAT.md",
  "PLAYBOOK.md",
  "SOUL.md",
  "SKILL.md",
] as const;

// ─── Ensure Agent Workspace (A) ─────────────────────────────────────

/**
 * Create the agent workspace + memory directory on the VM and return the
 * current file listing. Idempotent — safe to call if directory already exists.
 */
export async function ensureAgentWorkspace(
  sshConfig: SSHConfig,
  agentSlug: string,
): Promise<{ files: string[] }> {
  const workspacePath = agentWorkspacePath(agentSlug);
  await sshExec(
    sshConfig,
    `mkdir -p ${workspacePath}/memory && chown -R ${VM_USER}:${VM_USER} ${workspacePath}`,
  );
  const lsResult = await sshExec(sshConfig, `ls ${workspacePath}/ 2>/dev/null`, {
    timeoutMs: 10_000,
  });
  const files = lsResult.stdout.trim().split("\n").filter(Boolean);
  return { files };
}

// ─── Upload Agent Config Files (B) ──────────────────────────────────

export interface UploadAgentConfigOpts {
  /** Plain API key to embed in IDENTITY.md. Auto-generates if not provided. */
  apiKey?: string;
  /** DB agent ID — required for auto API key generation. */
  agentId: string;
  /** If true, only upload files not already on VM (default: false). */
  onlyMissing?: boolean;
  /** If true, never overwrite MEMORY.md (default: false). */
  preserveMemory?: boolean;
  /** Pre-fetched file listing to avoid extra `ls`. */
  existingFiles?: string[];
}

/**
 * Generate agent config files and upload them to the VM workspace.
 * Handles API key generation, selective upload, and memory preservation.
 */
export async function uploadAgentConfigFiles(
  sshConfig: SSHConfig,
  agent: {
    id: string;
    name: string;
    role: string | null;
    username?: string | null;
    identityEmoji: string | null;
    personality: string | null;
    level: string | null;
    templateId: string | null;
  },
  agentSlug: string,
  opts: UploadAgentConfigOpts,
): Promise<void> {
  const workspacePath = agentWorkspacePath(agentSlug);

  // Determine which files already exist on the VM
  let existingFiles: Set<string>;
  if (opts.existingFiles) {
    existingFiles = new Set(opts.existingFiles);
  } else if (opts.onlyMissing || opts.preserveMemory) {
    const lsResult = await sshExec(sshConfig, `ls -1 ${workspacePath}/ 2>/dev/null || true`, {
      timeoutMs: 10_000,
    });
    existingFiles = new Set(lsResult.stdout.trim().split("\n").filter(Boolean));
  } else {
    existingFiles = new Set();
  }

  // Determine the API key to embed
  let apiKeyForConfig = opts.apiKey || "";
  if (!apiKeyForConfig) {
    const identityWillBeWritten = !opts.onlyMissing || !existingFiles.has("IDENTITY.md");
    if (identityWillBeWritten) {
      const { plainKey, hash, prefix } = generateApiKey();
      await updateAgent(opts.agentId, {
        apiKeyHash: hash,
        apiKeyPrefix: prefix,
        apiKeyCreatedAt: new Date(),
      });
      apiKeyForConfig = plainKey;
    } else {
      apiKeyForConfig = "EXISTING_KEY"; // won't be used — IDENTITY.md already exists and onlyMissing=true
    }
  }

  // Guard: IDENTITY.md must never be written with a missing or placeholder key.
  // A bad key silently breaks all agent authentication — fail loudly instead.
  const mcUrl = getMcUrl();
  const identityWillBeWritten = !opts.onlyMissing || !existingFiles.has("IDENTITY.md");
  if (identityWillBeWritten && (!apiKeyForConfig || apiKeyForConfig === "EXISTING_KEY")) {
    throw new Error(
      `uploadAgentConfigFiles: cannot write IDENTITY.md for agent "${agentSlug}" — API key is missing. ` +
        `Pass a real key via opts.apiKey, or ensure the agent exists in the DB for auto-generation.`,
    );
  }

  const configFiles = generateAgentConfig(
    {
      id: agent.id,
      name: agent.name,
      role: agent.role || "",
      username: agentSlug,
      identityEmoji: agent.identityEmoji || "🤖",
      personality: agent.personality || "",
      level: agent.level || AgentLevel.SPECIALIST,
      templateId: agent.templateId || undefined,
    },
    mcUrl,
    undefined,
    apiKeyForConfig,
  );

  for (const file of configFiles) {
    if (opts.preserveMemory && file.filename === "MEMORY.md" && existingFiles.has("MEMORY.md")) {
      continue;
    }
    if (opts.onlyMissing && existingFiles.has(file.filename)) {
      continue;
    }
    await sshUploadFile(sshConfig, `${workspacePath}/${file.filename}`, file.content);
  }
  await sshExec(sshConfig, `chown -R ${VM_USER}:${VM_USER} ${workspacePath}`);
}

// ─── Ensure Agent in Config (C) ─────────────────────────────────────

/**
 * Read openclaw.json, check if the agent is in the agents list, add if missing.
 * Returns whether the agent was added (indicating a restart may be needed).
 */
export async function ensureAgentInConfig(
  sshConfig: SSHConfig,
  agentSlug: string,
): Promise<{ added: boolean }> {
  const config = await readVMConfig(sshConfig);
  const agentsObj = (config.agents as Record<string, unknown>) || {};
  const agentsList = (agentsObj.list as { id: string; name: string; workspace: string }[]) || [];
  const inList = agentsList.some((a) => a.id === agentSlug || a.name === agentSlug);

  if (inList) return { added: false };

  agentsList.push({
    id: agentSlug,
    name: agentSlug,
    workspace: agentWorkspacePath(agentSlug),
  });
  agentsObj.list = agentsList;
  config.agents = agentsObj;
  await writeVMConfig(sshConfig, config);
  return { added: true };
}

// ─── Ensure Gateway Config (D) ──────────────────────────────────────

/**
 * Ensure gateway, hooks, and security config in openclaw.json.
 *
 * @param opts.full - If true, apply the full repair config (loopback binding,
 *   controlUi, session, tools, discovery, logging, plugins). Default: false (assign-only).
 * @param opts.updateVMToken - Callback to store a new gateway token in the DB.
 */
export async function ensureGatewayConfig(
  sshConfig: SSHConfig,
  opts?: {
    full?: boolean;
    updateVMToken?: (token: string) => Promise<void>;
    /** Merge agents list into config in the same write (avoids a second write that triggers hot-reload restart). */
    agentsList?: { id: string; name: string; workspace: string; model?: string }[];
  },
): Promise<void> {
  const config = await readVMConfig(sshConfig);

  // gateway.mode + auth + remote + chat completions
  const gw = (config.gateway as Record<string, unknown>) || {};
  gw.mode = "local";
  if (opts?.full) gw.bind = "loopback";

  const gwAuth = (gw.auth as Record<string, unknown>) || {};
  if (opts?.full) gwAuth.mode = "token";
  if (!gwAuth.token) {
    const { randomBytes } = await import("crypto");
    const newToken = randomBytes(32).toString("base64url");
    gwAuth.token = newToken;
    if (opts?.updateVMToken) await opts.updateVMToken(newToken);
  }
  gw.auth = gwAuth;

  const gwRemote = (gw.remote as Record<string, unknown>) || {};
  gwRemote.token = gwAuth.token;
  gw.remote = gwRemote;

  const gwHttp = (gw.http as Record<string, unknown>) || {};
  const gwEndpoints = (gwHttp.endpoints as Record<string, unknown>) || {};
  gwEndpoints.chatCompletions = { enabled: true };
  gwHttp.endpoints = gwEndpoints;
  gw.http = gwHttp;

  if (opts?.full) {
    delete gw.nodes;
    const gwControlUi = (gw.controlUi as Record<string, unknown>) || {};
    gwControlUi.dangerouslyDisableDeviceAuth = false;
    gwControlUi.dangerouslyAllowHostHeaderOriginFallback = false;
    gw.controlUi = gwControlUi;
  }
  config.gateway = gw;

  if (opts?.full) {
    // Session isolation
    const session = (config.session as Record<string, unknown>) || {};
    session.dmScope = "per-channel-peer";
    config.session = session;

    // Tool restrictions
    const tools = (config.tools as Record<string, unknown>) || {};
    tools.deny = ["group:automation", "sessions_spawn", "sessions_send"];
    tools.fs = { workspaceOnly: true };
    tools.exec = { host: "sandbox" };
    tools.elevated = { enabled: false };
    config.tools = tools;

    // Disable mDNS discovery
    config.discovery = { mdns: { mode: "off" } };

    // Enable sensitive data redaction
    const logging = (config.logging as Record<string, unknown>) || {};
    logging.redactSensitive = "tools";
    config.logging = logging;

    // Lock to pinned version — prevent agents from self-upgrading to untested releases
    config.autoUpdate = { enabled: false };

    // Lock down plugins — preserve agentcenter-bridge entry if already configured,
    // wipe all other plugin entries for security.
    const existingPluginEntries = ((config.plugins as any)?.entries ?? {}) as Record<
      string,
      unknown
    >;
    const bridgeEntry = existingPluginEntries["agentcenter-bridge"];
    config.plugins = {
      allow: bridgeEntry ? ["agentcenter-bridge"] : [],
      ...(bridgeEntry ? { entries: { "agentcenter-bridge": bridgeEntry } } : {}),
    };
  }

  // hooks
  const hooks = (config.hooks as Record<string, unknown>) || {};
  if (!hooks.enabled) hooks.enabled = true;
  if (!hooks.token) {
    const { randomBytes } = await import("crypto");
    hooks.token = randomBytes(32).toString("base64url");
  }
  if (opts?.full) {
    delete hooks.allowUnsafeExternalContent;
    if (!hooks.allowedSessionKeyPrefixes) hooks.allowedSessionKeyPrefixes = ["hook:", "external:"];
  }
  config.hooks = hooks;

  // Remove stale/invalid top-level keys
  delete config.missionControl;
  delete config.memory;
  delete config.dm;
  delete config.sessions;
  delete config.sandbox;

  // Clean up agent defaults
  const agentsObj = (config.agents as Record<string, unknown>) || {};
  if (agentsObj.defaults) {
    const defs = agentsObj.defaults as Record<string, unknown>;
    delete defs.memorySearch;

    // Fix malformed `models` — if it has a `primary` string key it was written incorrectly
    // (should be a catalog keyed by model ID, not { primary: "..." })
    if (defs.models && typeof defs.models === "object") {
      const catalog = defs.models as Record<string, unknown>;
      if ("primary" in catalog && typeof catalog.primary === "string") {
        delete catalog.primary;
        // If nothing left in models after cleanup, remove it entirely
        if (Object.keys(catalog).length === 0) {
          delete defs.models;
        }
      }
    }
  }

  // Ensure sandbox mode is enabled when tools.exec.host requires it
  if (opts?.full) {
    const existingDefaults = (agentsObj.defaults as Record<string, unknown>) || {};
    if (!existingDefaults.sandbox) existingDefaults.sandbox = { mode: "non-main" };
    agentsObj.defaults = existingDefaults;
  }

  // Merge agents list into the same write to avoid a second config change
  if (opts?.agentsList) {
    const existingDefaults = (agentsObj.defaults as Record<string, unknown>) || {};
    agentsObj.defaults = existingDefaults;
    agentsObj.list = opts.agentsList;
  }
  config.agents = agentsObj;

  await writeVMConfig(sshConfig, config);
}

// ─── Build Agents List (E) ──────────────────────────────────────────

/**
 * Map VM agent records to the openclaw.json agents list format.
 * When an agent has a per-agent `llmModel` override, includes the `model` field
 * so OpenClaw uses that model instead of the VM default.
 */
export function buildAgentsList(
  vmAgents: { username?: string | null; name: string; llmModel?: string | null }[],
): { id: string; name: string; workspace: string; model?: string }[] {
  return vmAgents.map((a) => {
    const slug = getAgentSlug(a);
    const entry: { id: string; name: string; workspace: string; model?: string } = {
      id: slug,
      name: slug,
      workspace: agentWorkspacePath(slug),
    };
    if (a.llmModel) {
      entry.model = a.llmModel;
    }
    return entry;
  });
}
