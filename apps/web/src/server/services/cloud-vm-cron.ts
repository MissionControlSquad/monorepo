/**
 * Centralised heartbeat cron management for Cloud VMs.
 *
 * All cron operations (create, remove, ensure) should go through this file
 * to avoid duplication and inconsistent error handling.
 */

import { type SSHConfig } from "./ssh";
import { ocExec, restartGateway } from "./cloud-vm-utils";

interface CronResult {
  ok: boolean;
  message: string;
  /** Number of duplicate crons removed before creating */
  removedCount: number;
}

/**
 * Parse cron list output and return lines matching the given agent slug.
 * Each line's first whitespace-separated column is the cron UUID.
 */
function parseCronLines(output: string, agentSlug: string): { id: string; line: string }[] {
  return output
    .split("\n")
    .filter((l) => l.includes(agentSlug))
    .map((line) => {
      const id = line.trim().split(/\s+/)[0] || "";
      return { id, line };
    })
    .filter((entry) => entry.id.includes("-")); // UUIDs contain hyphens
}

/**
 * Remove all heartbeat crons for an agent.
 * Returns the number of crons removed.
 */
export async function removeAgentCrons(sshConfig: SSHConfig, agentSlug: string): Promise<number> {
  const listResult = await ocExec(sshConfig, "openclaw cron list 2>&1", { timeoutMs: 15_000 });
  const entries = parseCronLines(listResult.stdout, agentSlug);

  for (const entry of entries) {
    await ocExec(sshConfig, `openclaw cron remove ${entry.id} 2>&1`, { timeoutMs: 10_000 });
  }

  return entries.length;
}

/**
 * Ensure exactly one heartbeat cron exists for an agent.
 *
 * - If one cron already exists → no-op (returns ok)
 * - If zero or >1 crons → removes all, creates fresh
 * - Handles token mismatch (restarts gateway and retries)
 * - Handles invalid config (runs openclaw doctor --fix and retries)
 */
export async function ensureHeartbeatCron(
  sshConfig: SSHConfig,
  agentSlug: string,
  cronSchedule: string,
): Promise<CronResult> {
  // Check current state
  const listResult = await ocExec(sshConfig, "openclaw cron list 2>&1", { timeoutMs: 15_000 });
  const entries = parseCronLines(listResult.stdout, agentSlug);

  // Exactly one cron already exists — nothing to do
  if (entries.length === 1) {
    return { ok: true, message: "Heartbeat cron active", removedCount: 0 };
  }

  // Remove all existing (0 is fine — loop just doesn't execute)
  for (const entry of entries) {
    await ocExec(sshConfig, `openclaw cron remove ${entry.id} 2>&1`, { timeoutMs: 10_000 });
  }

  // Create fresh cron
  const cronCmd = buildCronCmd(agentSlug, cronSchedule);
  const result = await createCronWithRetry(sshConfig, cronCmd);

  if (!result.ok) {
    return { ok: false, message: result.message, removedCount: entries.length };
  }

  // Post-creation verification: confirm exactly 1 cron exists
  const verifyResult = await ocExec(sshConfig, "openclaw cron list 2>&1", { timeoutMs: 15_000 });
  const verifyEntries = parseCronLines(verifyResult.stdout, agentSlug);

  if (verifyEntries.length === 0) {
    return {
      ok: false,
      message: "Cron creation reported success but no cron found in list",
      removedCount: entries.length,
    };
  }

  if (verifyEntries.length > 1) {
    // Deduplicate — keep the first, remove the rest
    for (let i = 1; i < verifyEntries.length; i++) {
      await ocExec(sshConfig, `openclaw cron remove ${verifyEntries[i].id} 2>&1`, {
        timeoutMs: 10_000,
      });
    }
  }

  return {
    ok: true,
    message:
      entries.length > 1
        ? `Deduplicated and recreated heartbeat cron (schedule: ${cronSchedule})`
        : `Heartbeat cron created (schedule: ${cronSchedule})`,
    removedCount: entries.length,
  };
}

/**
 * Build the openclaw cron add command string.
 */
function buildCronCmd(agentSlug: string, cronSchedule: string): string {
  return `openclaw cron add --name "${agentSlug}-heartbeat" --agent "${agentSlug}" --cron "${cronSchedule}" --session isolated --message "Read HEARTBEAT.md and follow the instructions." --timeout-seconds 300 2>&1`;
}

/**
 * Try to create a cron. On failure, handles:
 * 1. Token mismatch → restart gateway, retry
 * 2. Invalid config → run openclaw doctor --fix, retry
 */
async function createCronWithRetry(
  sshConfig: SSHConfig,
  cronCmd: string,
): Promise<{ ok: boolean; message: string }> {
  let result = await ocExec(sshConfig, cronCmd, { timeoutMs: 15_000 });

  if (result.code === 0 && !result.stdout.includes("Invalid config")) {
    return { ok: true, message: "ok" };
  }

  const errMsg = (result.stdout.trim() + " " + result.stderr.trim()).trim();

  // Token mismatch — restart gateway and retry
  if (errMsg.includes("unauthorized") || errMsg.includes("token mismatch")) {
    console.warn("[cloud-vm-cron] Token mismatch on cron create — restarting gateway and retrying");
    await restartGateway(sshConfig);

    result = await ocExec(sshConfig, cronCmd, { timeoutMs: 15_000 });
    if (result.code === 0 && !result.stdout.includes("Invalid config")) {
      return { ok: true, message: "ok (after gateway restart due to token mismatch)" };
    }
    return {
      ok: false,
      message: result.stdout.trim() || result.stderr.trim() || "Failed after gateway restart",
    };
  }

  // Invalid config — try openclaw doctor --fix
  if (errMsg.includes("Invalid config") || errMsg.includes("invalid")) {
    console.warn(
      "[cloud-vm-cron] Invalid config on cron create — running openclaw doctor --fix and retrying",
    );
    await ocExec(sshConfig, "openclaw doctor --fix 2>&1", { timeoutMs: 15_000 });

    result = await ocExec(sshConfig, cronCmd, { timeoutMs: 15_000 });
    if (result.code === 0 && !result.stdout.includes("Invalid config")) {
      return { ok: true, message: "ok (after openclaw doctor --fix)" };
    }
    return {
      ok: false,
      message: result.stdout.trim() || result.stderr.trim() || "Failed after doctor fix",
    };
  }

  return { ok: false, message: errMsg || "Failed to create cron" };
}
