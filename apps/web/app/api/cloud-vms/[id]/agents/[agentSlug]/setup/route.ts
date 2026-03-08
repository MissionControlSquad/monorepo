import { prisma } from "@/server/prisma";
import { computeCronSchedule } from "@/server/agent-config-generator";
import { ensureHeartbeatCron } from "@/server/services/cloud-vm-cron";
import {
  getVMSSHConfig,
  ocExec,
  computeAgentCronIndex,
  restartGateway,
} from "@/server/services/cloud-vm-utils";
import { successResponse, errorResponse, handleError } from "../../../../../_lib/json-response";

/**
 * GET /api/cloud-vms/[id]/agents/[agentSlug]/setup
 * Check if heartbeat cron exists for this agent.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; agentSlug: string }> },
) {
  try {
    const { id, agentSlug } = await params;

    const vm = await prisma.cloudVM.findUnique({
      where: { id },
      select: { ipv4: true, sshPrivateKey: true, status: true },
    });

    if (!vm) return errorResponse("VM not found", 404);
    if (vm.status !== "running" || !vm.ipv4 || !vm.sshPrivateKey) {
      return errorResponse("VM is not running", 400);
    }

    const sshConfig = getVMSSHConfig(vm);

    const cronCheck = await ocExec(sshConfig, "openclaw cron list 2>&1", { timeoutMs: 15_000 });
    const rawOutput = cronCheck.stdout.trim();
    console.log(
      `[cron-check] agent=${agentSlug} code=${cronCheck.code} output=${rawOutput.slice(0, 1000)}`,
    );

    // Parse table output — find lines containing the agent slug
    const lines = rawOutput.split("\n").filter((l) => l.includes(agentSlug));
    const count = lines.length;

    // Extract schedule from the first matching line (columns are whitespace-separated)
    let schedule: string | null = null;
    if (lines.length > 0) {
      const cronMatch = lines[0].match(/cron\s+([\d,*/ ]+)/);
      if (cronMatch) schedule = cronMatch[1].trim();
    }

    console.log(`[cron-check] found ${count} cron(s) for ${agentSlug}, schedule=${schedule}`);

    return successResponse({
      cronExists: count > 0,
      count,
      schedule,
    });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /api/cloud-vms/[id]/agents/[agentSlug]/setup
 * Run setup actions for a specific agent on the VM via SSH.
 *
 * Body: { action: "cron" | "restart-gateway" | "all" }
 *
 * "cron"             — Create heartbeat cron job
 * "restart-gateway"  — Restart the OpenClaw gateway service
 * "all"              — Run all setup steps (cron + restart)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; agentSlug: string }> },
) {
  try {
    const { id, agentSlug } = await params;
    const body = await request.json().catch(() => ({}));
    const { action = "all" } = body as { action?: string };

    const vm = await prisma.cloudVM.findUnique({
      where: { id },
      select: { ipv4: true, sshPrivateKey: true, status: true },
    });

    if (!vm) return errorResponse("VM not found", 404);
    if (vm.status !== "running" || !vm.ipv4 || !vm.sshPrivateKey) {
      return errorResponse("VM is not running", 400);
    }

    const sshConfig = getVMSSHConfig(vm);
    const results: { action: string; ok: boolean; message: string }[] = [];

    // Compute agent's cron index via centralized alphabetical sort
    const agentIndex = await computeAgentCronIndex(id, agentSlug);

    if (action === "cron" || action === "all") {
      const cronSchedule = computeCronSchedule(agentIndex);
      const cronResult = await ensureHeartbeatCron(sshConfig, agentSlug, cronSchedule);
      results.push({
        action: "cron",
        ok: cronResult.ok,
        message: cronResult.ok ? cronResult.message : cronResult.message,
      });
    }

    if (action === "restart-gateway" || action === "all") {
      const gatewayOk = await restartGateway(sshConfig);
      results.push({
        action: "restart-gateway",
        ok: gatewayOk,
        message: gatewayOk ? "Gateway restarted" : "Failed to restart gateway",
      });
    }

    const allOk = results.every((r) => r.ok);
    return successResponse({ ok: allOk, results });
  } catch (err) {
    return handleError(err);
  }
}
