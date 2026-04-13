import { findCloudVMConnection, findAgentBySlug } from "@agentcenter/database";
import { CloudVmStatus } from "@/server/constants";
import { sshExec } from "@/server/services/ssh";
import {
  successResponse,
  errorResponse,
  handleError,
  assertFound,
} from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";
import { computeCronSchedule } from "@/server/agent-config-generator";
import { ensureHeartbeatCron } from "@/server/services/cloud-vm-cron";
import { getAgentSlug } from "@agentcenter/utils";
import {
  getVMSSHConfig,
  ocExec,
  readVMConfig,
  listAgentsOnVM,
  isAgentRegistered,
  restartGateway,
  computeAgentCronIndex,
  ensureAgentWorkspace,
  uploadAgentConfigFiles,
  ensureAgentInConfig,
  REQUIRED_AGENT_FILES,
} from "@/server/services/cloud-vm-utils";

interface CheckResult {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
  fixed?: boolean;
}

/**
 * POST /api/cloud-vms/[id]/validate
 *
 * Body: { level: "system" | "agent", agentId?: string, autoFix?: boolean }
 *
 * level=system: OpenClaw service, config, gateway, hooks, LLM, agents list
 * level=agent:  Workspace files, cron, LLM test message for a specific agent
 *
 * autoFix=true: Attempt to repair any issues found (default: true)
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const {
      level = "system",
      agentId,
      autoFix = true,
    } = body as {
      level?: "system" | "agent";
      agentId?: string;
      autoFix?: boolean;
    };

    const vm = await findCloudVMConnection(id);

    assertFound(vm, ERR.VM_NOT_FOUND);
    if (vm.status !== CloudVmStatus.RUNNING || !vm.ipv4 || !vm.sshPrivateKey) {
      return errorResponse(ERR.VM_NOT_RUNNING, 400);
    }

    const sshConfig = getVMSSHConfig(vm);
    const checks: CheckResult[] = [];

    if (level === "system") {
      // ── System-level checks ──

      // 1. OpenClaw service running
      const serviceCheck = await sshExec(sshConfig, "systemctl is-active openclaw", {
        timeoutMs: 10_000,
      });
      let serviceActive = serviceCheck.stdout.trim() === "active";

      if (!serviceActive && autoFix) {
        serviceActive = await restartGateway(sshConfig);
        checks.push({
          name: "OpenClaw Service",
          status: serviceActive ? "pass" : "fail",
          message: serviceActive
            ? "Service restarted successfully"
            : `Service failed to start after restart`,
          fixed: serviceActive,
        });
      } else {
        checks.push({
          name: "OpenClaw Service",
          status: serviceActive ? "pass" : "fail",
          message: serviceActive
            ? "Service is running"
            : `Service is ${serviceCheck.stdout.trim() || "not found"}`,
        });
      }

      // 2. Config file valid
      const configObj = await readVMConfig(sshConfig);
      const configValid = Object.keys(configObj).length > 0;
      checks.push({
        name: "Config File",
        status: configValid ? "pass" : "fail",
        message: configValid
          ? "openclaw.json is valid"
          : "openclaw.json is missing or invalid JSON",
      });

      // 3. Gateway mode
      const gwMode = (configObj.gateway as Record<string, unknown>)?.mode;
      checks.push({
        name: "Gateway Mode",
        status: gwMode === "local" ? "pass" : "fail",
        message:
          gwMode === "local"
            ? "Gateway mode is local"
            : `Gateway mode is "${gwMode || "not set"}" (expected "local")`,
      });

      // 4. Hooks enabled
      const hooks = configObj.hooks as Record<string, unknown> | undefined;
      const hooksEnabled = hooks?.enabled === true && !!hooks?.token;
      checks.push({
        name: "Hooks",
        status: hooksEnabled ? "pass" : "fail",
        message: hooksEnabled
          ? "Hooks enabled with auth token"
          : "Hooks not enabled or missing token",
      });

      // 5. LLM configured — check if any API key env vars are set
      const envBlock = configObj.env as Record<string, unknown> | undefined;
      const envVars = (envBlock?.vars as Record<string, unknown>) || {};
      const llmKeys = Object.keys({ ...envBlock, ...envVars }).filter(
        (k) => k.endsWith("_API_KEY") && k !== "vars",
      );
      checks.push({
        name: "LLM API Key",
        status: llmKeys.length > 0 ? "pass" : "fail",
        message: llmKeys.length > 0 ? `Found: ${llmKeys.join(", ")}` : "No LLM API key configured",
      });

      // 6. Agents list
      const agents = await listAgentsOnVM(sshConfig);
      checks.push({
        name: "Agents",
        status: agents.length > 0 ? "pass" : "warn",
        message:
          agents.length > 0
            ? `${agents.length} agent(s): ${agents.map((a) => a.id || a.name).join(", ")}`
            : "No agents configured",
      });

      // 7. Disk space
      const diskCheck = await sshExec(sshConfig, "df -h / | tail -1 | awk '{print $5, $4}'", {
        timeoutMs: 10_000,
      });
      const [usedPct, available] = diskCheck.stdout.trim().split(" ");
      const usedNum = parseInt(usedPct);
      checks.push({
        name: "Disk Space",
        status: usedNum > 90 ? "fail" : usedNum > 75 ? "warn" : "pass",
        message: `${usedPct} used, ${available} available`,
      });
    } else if (level === "agent") {
      // ── Agent-level checks (self-healing) ──

      if (!agentId) {
        return errorResponse("agentId is required for agent-level validation", 400);
      }

      // Look up the agent from DB for config generation
      const agent = await findAgentBySlug(id, agentId);

      if (!agent) {
        return errorResponse(`Agent "${agentId}" not found in database for this VM`, 404);
      }

      const agentSlug = getAgentSlug(agent);
      let needsRestart = false;

      // ── 1. Agent registered in OpenClaw ──
      let registered = await isAgentRegistered(sshConfig, agentSlug);

      if (!registered && autoFix) {
        // Fix: add agent to openclaw.json agents list and restart
        await ensureAgentInConfig(sshConfig, agentSlug);
        await restartGateway(sshConfig);

        // Re-verify
        registered = await isAgentRegistered(sshConfig, agentSlug);

        checks.push({
          name: "Agent Registered",
          status: registered ? "pass" : "fail",
          message: registered
            ? `"${agentSlug}" added to agents list and verified`
            : `"${agentSlug}" still not in agents list after fix attempt`,
          fixed: registered,
        });
      } else {
        checks.push({
          name: "Agent Registered",
          status: registered ? "pass" : "fail",
          message: registered
            ? `"${agentSlug}" found in agents list`
            : `"${agentSlug}" not found in openclaw agents list`,
        });
      }

      // ── 2. Workspace directory + memory ──
      const { files } = await ensureAgentWorkspace(sshConfig, agentSlug);
      const wsWasEmpty = files.length === 0;
      checks.push({
        name: "Workspace",
        status: !autoFix && wsWasEmpty ? "fail" : "pass",
        message: wsWasEmpty
          ? autoFix
            ? "Workspace directory created"
            : "Workspace is empty or missing"
          : `${files.length} files: ${files.slice(0, 8).join(", ")}${files.length > 8 ? "..." : ""}`,
        ...(autoFix && wsWasEmpty ? { fixed: true } : {}),
      });

      // ── 3. Required config files ──
      const missingFiles = [...REQUIRED_AGENT_FILES].filter((f) => !files.includes(f));

      if (missingFiles.length > 0 && autoFix) {
        await uploadAgentConfigFiles(sshConfig, agent, agentSlug, {
          agentId: agent.id,
          onlyMissing: true,
          existingFiles: files,
        });

        // Re-check
        const { files: recheckedFiles } = await ensureAgentWorkspace(sshConfig, agentSlug);
        const stillMissing = [...REQUIRED_AGENT_FILES].filter((f) => !recheckedFiles.includes(f));

        checks.push({
          name: "Config Files",
          status: stillMissing.length === 0 ? "pass" : "fail",
          message:
            stillMissing.length === 0
              ? "Missing config files restored"
              : `Still missing after fix: ${stillMissing.join(", ")}`,
          fixed: stillMissing.length === 0,
        });
      } else {
        checks.push({
          name: "Config Files",
          status:
            missingFiles.length === 0
              ? "pass"
              : missingFiles.length < REQUIRED_AGENT_FILES.length
                ? "warn"
                : "fail",
          message:
            missingFiles.length === 0
              ? "All required files present"
              : `Missing: ${missingFiles.join(", ")}`,
        });
      }

      // ── 4. Heartbeat cron ──
      if (autoFix) {
        // If we haven't restarted yet, do it before cron operations (avoids token mismatch)
        if (needsRestart) {
          await restartGateway(sshConfig);
          needsRestart = false;
        }

        const agentIndex = await computeAgentCronIndex(id, agentSlug);
        const cronSchedule = computeCronSchedule(agentIndex);
        const cronResult = await ensureHeartbeatCron(sshConfig, agentSlug, cronSchedule);

        checks.push({
          name: "Heartbeat Cron",
          status: cronResult.ok ? "pass" : "fail",
          message: cronResult.message,
          fixed: cronResult.ok && cronResult.message !== "Heartbeat cron active",
        });
      } else {
        const cronCheck = await ocExec(sshConfig, "openclaw cron list 2>&1", { timeoutMs: 15_000 });
        const cronLines = cronCheck.stdout.split("\n").filter((l) => l.includes(agentSlug));

        checks.push({
          name: "Heartbeat Cron",
          status: cronLines.length === 1 ? "pass" : "warn",
          message:
            cronLines.length === 1
              ? `Heartbeat cron active for "${agentSlug}"`
              : cronLines.length > 1
                ? `${cronLines.length} duplicate crons found for "${agentSlug}"`
                : `No heartbeat cron — agent won't wake up automatically`,
        });
      }

      // ── 5. Agent sessions ──
      const sessionsCheck = await ocExec(
        sshConfig,
        `openclaw sessions list --agent ${agentSlug} --json 2>/dev/null || echo '[]'`,
        { timeoutMs: 15_000 },
      );
      let sessions: unknown[] = [];
      try {
        const parsed = JSON.parse(sessionsCheck.stdout.trim());
        sessions = Array.isArray(parsed) ? parsed : [];
      } catch {
        // fallback
      }
      checks.push({
        name: "Sessions",
        status: sessions.length > 0 ? "pass" : "warn",
        message:
          sessions.length > 0
            ? `${sessions.length} session(s) found`
            : "No sessions — agent hasn't been active yet",
      });

      // ── 6. LLM test ──
      const testResult = await ocExec(
        sshConfig,
        `openclaw agent --agent ${agentSlug} --message "Reply with exactly: OK" --timeout 30 2>&1`,
        { timeoutMs: 45_000 },
      );
      const output = testResult.stdout.trim();
      const hasOk = output.toLowerCase().includes("ok");
      const hasError = output.toLowerCase().includes("error") || testResult.code !== 0;

      if (hasError && !hasOk) {
        const errorLine =
          output.split("\n").find((l) => l.toLowerCase().includes("error")) || output.slice(0, 200);
        checks.push({
          name: "LLM Response",
          status: "fail",
          message: errorLine,
        });
      } else {
        checks.push({
          name: "LLM Response",
          status: "pass",
          message: "Agent responded successfully",
        });
      }
    }

    const allPass = checks.every((c) => c.status === "pass");
    const hasFail = checks.some((c) => c.status === "fail");
    const fixedCount = checks.filter((c) => c.fixed).length;

    return successResponse({
      overall: hasFail ? "fail" : allPass ? "pass" : "warn",
      checks,
      ...(fixedCount > 0 ? { fixedCount } : {}),
    });
  } catch (err) {
    return handleError(err);
  }
}
