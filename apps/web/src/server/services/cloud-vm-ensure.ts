/**
 * Self-healing validation for agents already assigned to a VM.
 *
 * When "Deploy to VM" is clicked for an agent that's already on the VM,
 * this checks everything and fixes what's broken:
 * - Agent in openclaw.json agents list
 * - Workspace + memory directory exist
 * - Config files present (IDENTITY.md, HEARTBEAT.md, PLAYBOOK.md, etc.)
 * - Heartbeat cron active
 * - Gateway restart if needed
 */

import { findCloudVMForEnsure, findAgentById } from "@agentcenter/database";
import { CloudVmStatus } from "@/server/constants";
import { computeCronSchedule } from "@/server/agent-config-generator";
import { sshExec } from "./ssh";
import { ensureHeartbeatCron } from "./cloud-vm-cron";
import { VM_USER, VM_HOME } from "./cloud-vm-paths";
import { getAgentSlug } from "@agentcenter/utils";
import {
  getVMSSHConfig,
  restartGateway,
  isAgentRegistered,
  computeAgentCronIndex,
  ensureAgentWorkspace,
  uploadAgentConfigFiles,
  ensureAgentInConfig,
  REQUIRED_AGENT_FILES,
} from "./cloud-vm-utils";

interface EnsureCheck {
  name: string;
  status: "pass" | "fixed" | "fail";
  message: string;
}

interface EnsureResult {
  ok: boolean;
  checks: EnsureCheck[];
  fixedCount: number;
}

export async function ensureAgentOnVM(vmId: string, agentId: string): Promise<EnsureResult> {
  const vm = await findCloudVMForEnsure(vmId);

  if (vm.status !== CloudVmStatus.RUNNING) {
    throw new Error("VM is not running");
  }

  const agent = await findAgentById(agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);
  const agentSlug = getAgentSlug(agent);
  const sshConfig = getVMSSHConfig(vm);
  const checks: EnsureCheck[] = [];
  let needsRestart = false;

  // ── 1. Ensure agent is in openclaw.json agents list ──
  const { added } = await ensureAgentInConfig(sshConfig, agentSlug);
  if (added) {
    needsRestart = true;
    checks.push({
      name: "Agent in Config",
      status: "fixed",
      message: `Added "${agentSlug}" to agents list`,
    });
  } else {
    checks.push({
      name: "Agent in Config",
      status: "pass",
      message: `"${agentSlug}" in agents list`,
    });
  }

  // ── 2. Ensure workspace + memory directory ──
  const { files } = await ensureAgentWorkspace(sshConfig, agentSlug);
  checks.push({
    name: "Workspace",
    status: files.length === 0 ? "fixed" : "pass",
    message:
      files.length === 0 ? "Created workspace + memory directory" : `${files.length} files present`,
  });

  // ── 3. Re-upload all config files (preserving MEMORY.md only) ──
  // Always overwrite — this refreshes IDENTITY.md with a new API key and the
  // current MC URL, fixes any corrupted files, and keeps config in sync.
  await uploadAgentConfigFiles(sshConfig, agent, agentSlug, {
    agentId: agent.id,
    preserveMemory: true,
    existingFiles: files,
  });
  checks.push({
    name: "Config Files",
    status: "fixed",
    message: "Config files refreshed (IDENTITY.md, HEARTBEAT.md, PLAYBOOK.md)",
  });

  // Fix ownership — SSH uploads as root, but gateway runs as agentcenter
  await sshExec(sshConfig, `chown -R ${VM_USER}:${VM_USER} ${VM_HOME}`);

  // ── 4. Restart gateway if config was changed ──
  if (needsRestart) {
    await restartGateway(sshConfig, { expectAgent: agentSlug });
    needsRestart = false;
  }

  // Verify agent is now visible
  const nowRegistered = await isAgentRegistered(sshConfig, agentSlug);

  if (!nowRegistered) {
    // Last resort — restart and re-check
    await restartGateway(sshConfig, { expectAgent: agentSlug });
  }

  // ── 5. Ensure heartbeat cron (exactly one) ──
  const agentIndex = await computeAgentCronIndex(vmId, agentSlug);
  const cronSchedule = computeCronSchedule(agentIndex);
  const cronResult = await ensureHeartbeatCron(sshConfig, agentSlug, cronSchedule);

  checks.push({
    name: "Heartbeat Cron",
    status: cronResult.ok
      ? cronResult.removedCount > 0 || cronResult.message !== "Heartbeat cron active"
        ? "fixed"
        : "pass"
      : "fail",
    message: cronResult.ok ? cronResult.message : `Failed: ${cronResult.message}`,
  });

  const fixedCount = checks.filter((c) => c.status === "fixed").length;
  const hasFail = checks.some((c) => c.status === "fail");

  return {
    ok: !hasFail,
    checks,
    fixedCount,
  };
}
