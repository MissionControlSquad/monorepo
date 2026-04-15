import {
  findCloudVMConnection,
  findAgentBySlug,
  findConnectionByAgentSlug,
} from "@agentcenter/database";
import { connectionRegistry } from "@/server/services/live-connection-registry";
import { CloudVmStatus } from "@/server/constants";
import { sshExec } from "@/server/services/ssh";
import {
  successResponse,
  errorResponse,
  handleError,
  assertFound,
} from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";
import { computeCronSchedule, getMcUrl } from "@/server/agent-config-generator";
import { ensureHeartbeatCron } from "@/server/services/cloud-vm-cron";
import { getAgentSlug, LLM_PROVIDERS, SetupStatus } from "@agentcenter/utils";
import { applyAgentStatusUpdate } from "@/server/agent-status";
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
import { VM_CONFIG_DIR, VM_WORKSPACE } from "@/server/services/cloud-vm-paths";

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

      // ── 5. Auth profiles (which AI provider is configured) ──
      const authProfilePath = `${VM_CONFIG_DIR}/agents/${agentSlug}/agent/auth-profiles.json`;
      const authRead = await sshExec(sshConfig, `cat ${authProfilePath} 2>/dev/null`, {
        timeoutMs: 10_000,
      });
      const authFileExists = authRead.code === 0 && authRead.stdout.trim().length > 0;

      if (!authFileExists) {
        checks.push({
          name: "AI Provider",
          status: "fail",
          message:
            "No auth-profiles.json found — go to AI Providers in settings and add an API key, then re-validate",
        });
      } else {
        const configuredProviders: string[] = [];
        let parseError = false;
        try {
          const parsed = JSON.parse(authRead.stdout.trim());
          // Support both { profiles: { "provider:default": { key } } } and flat { "provider:default": { key } }
          const entries: Record<string, unknown> =
            parsed.profiles && typeof parsed.profiles === "object" ? parsed.profiles : parsed;

          for (const [profileKey, value] of Object.entries(entries)) {
            if (!profileKey.includes(":")) continue;
            const profileVal = value as Record<string, unknown>;
            const rawKey = profileVal.key as string | undefined;
            if (!rawKey || rawKey.length < 8) continue; // skip missing/placeholder keys

            // Match profile key (e.g. "anthropic:default") to a known provider name
            const providerId = profileKey.split(":")[0];
            const provider = LLM_PROVIDERS.find((p) => p.id === providerId);
            const providerName = provider?.name ?? providerId;
            configuredProviders.push(providerName);
          }
        } catch {
          parseError = true;
        }

        if (parseError) {
          checks.push({
            name: "AI Provider",
            status: "warn",
            message:
              "auth-profiles.json is malformed — re-save your API key in AI Providers settings",
          });
        } else if (configuredProviders.length === 0) {
          checks.push({
            name: "AI Provider",
            status: "fail",
            message:
              "API key is missing or blank — go to AI Providers in settings and add your key, then re-validate",
          });
        } else {
          checks.push({
            name: "AI Provider",
            status: "pass",
            message: `Ready — using ${configuredProviders.join(", ")}`,
          });
        }
      }

      // ── 6. Heartbeat connectivity ──
      // Read the agent's API key from IDENTITY.md and hit the heartbeat-preflight endpoint.
      // This confirms: (a) IDENTITY.md is valid, (b) the key works, (c) the agent can reach AgentCenter.
      // Much faster than an LLM test — no tokens used, completes in < 5 seconds.
      const agentWorkspaceDir = `${VM_WORKSPACE}/${agentSlug}`;
      const identityRead = await sshExec(
        sshConfig,
        `grep -oP '(?<=\\*\\*API Key\\*\\*: )\\S+' ${agentWorkspaceDir}/IDENTITY.md 2>/dev/null`,
        { timeoutMs: 10_000 },
      );
      const agentApiKey = identityRead.stdout.trim();

      if (!agentApiKey) {
        checks.push({
          name: "Heartbeat",
          status: "fail",
          message:
            "Could not read API key from IDENTITY.md — run Validate again or re-assign the agent",
        });
      } else {
        const mcUrl = getMcUrl();
        let heartbeatStatus: "pass" | "fail" | "warn" = "fail";
        let heartbeatMessage = "Could not reach AgentCenter — check network or MC URL";
        let heartbeatFixed = false;

        const doHeartbeat = async () => {
          const hbRes = await fetch(`${mcUrl}/api/agents/me/heartbeat-preflight`, {
            headers: { Authorization: `Bearer ${agentApiKey}` },
            signal: AbortSignal.timeout(8_000),
          });

          if (hbRes.status === 401) {
            heartbeatStatus = "fail";
            heartbeatMessage =
              "API key rejected — the agent's key may have changed. Re-assign the agent to regenerate it";
          } else if (hbRes.status === 403) {
            // Three distinct 403 reasons — give user an actionable message for each
            let errorText = "";
            try {
              errorText = (await hbRes.json()).error ?? "";
            } catch {
              /* ignore */
            }

            if (errorText === "Agent setup is not complete") {
              if (autoFix) {
                // Cloud VM workspace is already provisioned — the PENDING_SETUP status
                // is a leftover from before the first ingest event. Mark active now.
                await applyAgentStatusUpdate(agent.id, { setupStatus: SetupStatus.ACTIVE });
                // Retry the heartbeat with the updated status
                const retryRes = await fetch(`${mcUrl}/api/agents/me/heartbeat-preflight`, {
                  headers: { Authorization: `Bearer ${agentApiKey}` },
                  signal: AbortSignal.timeout(8_000),
                });
                if (retryRes.status === 200) {
                  heartbeatFixed = true;
                  const hbData = (await retryRes.json()) as {
                    shouldWork?: boolean;
                    shutdown?: boolean;
                  };
                  heartbeatStatus = "pass";
                  heartbeatMessage = hbData.shouldWork
                    ? "Agent activated and live — has tasks ready to pick up"
                    : "Agent activated and live — resting (no tasks in queue)";
                } else {
                  heartbeatStatus = "fail";
                  heartbeatMessage = "Agent activated but still can't check in — re-run Validate";
                }
              } else {
                heartbeatStatus = "fail";
                heartbeatMessage =
                  "Agent setup is not marked complete — run Validate with auto-fix enabled to activate it";
              }
            } else if (errorText === "Agent is deactivated") {
              heartbeatStatus = "fail";
              heartbeatMessage =
                "Agent is deactivated — go to the agent's settings and reactivate it, then re-validate";
            } else if (errorText === "License not active") {
              heartbeatStatus = "fail";
              heartbeatMessage =
                "Your AgentCenter license is not active — check your subscription in Settings → Billing";
            } else {
              heartbeatStatus = "fail";
              heartbeatMessage = `Access denied (403)${errorText ? `: ${errorText}` : ""}`;
            }
          } else if (hbRes.status === 200) {
            const hbData = (await hbRes.json()) as { shouldWork?: boolean; shutdown?: boolean };
            if (hbData.shutdown) {
              heartbeatStatus = "warn";
              heartbeatMessage = "Agent is live but system is in shutdown mode — tasks are paused";
            } else if (hbData.shouldWork) {
              heartbeatStatus = "pass";
              heartbeatMessage = "Agent is live and has tasks ready to pick up";
            } else {
              heartbeatStatus = "pass";
              heartbeatMessage = "Agent is live and resting (no tasks in queue)";
            }
          } else {
            heartbeatStatus = "warn";
            heartbeatMessage = `Unexpected response from AgentCenter (HTTP ${hbRes.status}) — may be a temporary issue`;
          }
        };

        try {
          await doHeartbeat();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("timeout") || msg.includes("abort")) {
            heartbeatMessage =
              "Heartbeat timed out — AgentCenter may be slow or the agent can't reach it";
            heartbeatStatus = "warn";
          }
        }

        checks.push({
          name: "Heartbeat",
          status: heartbeatStatus,
          message: heartbeatMessage,
          ...(heartbeatFixed ? { fixed: true } : {}),
        });
      }

      // ── 7. Live Gateway connection ──
      // Verifies the mc-bridge plugin on the VM is connected to the live gateway.
      // We check: (a) a DB connection record exists for this agent's slug, and
      // (b) that connection is live in the in-memory WebSocket registry.
      // This proves messages can be delivered instantly without waiting for heartbeat.
      try {
        const liveConn = await findConnectionByAgentSlug(agentSlug);

        if (!liveConn) {
          checks.push({
            name: "Live Gateway",
            status: "warn",
            message:
              "Plugin not connected — install the AgentCenter Bridge plugin on the VM and make sure OpenClaw is running",
          });
        } else if (!connectionRegistry.has(liveConn.id)) {
          const disconnectedSince = liveConn.lastDisconnectedAt
            ? `since ${new Date(liveConn.lastDisconnectedAt).toLocaleTimeString()}`
            : "recently";
          checks.push({
            name: "Live Gateway",
            status: "warn",
            message: `Plugin registered but not connected (${disconnectedSince}) — it reconnects automatically; if this persists, restart OpenClaw on the VM`,
          });
        } else {
          const pluginVersion = liveConn.pluginVersion
            ? ` (plugin v${liveConn.pluginVersion})`
            : "";
          checks.push({
            name: "Live Gateway",
            status: "pass",
            message: `Connected${pluginVersion} — tasks will be delivered to the agent instantly`,
          });
        }
      } catch {
        checks.push({
          name: "Live Gateway",
          status: "warn",
          message: "Could not check live gateway status — database may be temporarily unavailable",
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
