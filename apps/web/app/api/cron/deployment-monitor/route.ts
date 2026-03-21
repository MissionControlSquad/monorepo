import { NextResponse } from "next/server";
import {
  findStaleSetupCloudVMs,
  markCloudVMError,
  logCloudVMEvent,
  listRunningCloudVMs,
  updateCloudVMUptime,
} from "@agentcenter/database";
import { env } from "@/server/env";
import { deleteServer, deleteSSHKey } from "@/server/services/hetzner";

// VMs stuck in any setup state for > 20 minutes are considered timed out
const SETUP_TIMEOUT_MS = 20 * 60 * 1000;

// CX22 cost: ~$4.49/mo ~ 0.6 cents/hour
const COST_CENTS_PER_HOUR = 0.6;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  let timedOut = 0;
  let uptimeUpdated = 0;

  // 1. VMs stuck in any setup state > 20 minutes
  const stuckVMs = await findStaleSetupCloudVMs(SETUP_TIMEOUT_MS);

  for (const vm of stuckVMs) {
    // Clean up Hetzner server
    if (vm.externalServerId) {
      try {
        await deleteServer(vm.externalServerId);
      } catch {
        // Server may not exist
      }
    }

    // Clean up SSH key
    if (vm.hetznerSshKeyId) {
      try {
        await deleteSSHKey(vm.hetznerSshKeyId);
      } catch {
        // Key may not exist
      }
    }

    await markCloudVMError(
      vm.id,
      `Timed out during setup (stuck in "${vm.status}" for >20 min)`,
      now,
    );

    await logCloudVMEvent(vm.id, `Timed out during setup (status: ${vm.status})`, "error");

    timedOut++;
  }

  // 2. Update uptime and estimated cost for running VMs
  const runningVMs = await listRunningCloudVMs();

  for (const vm of runningVMs) {
    const secondsSinceUpdate = Math.floor((now.getTime() - vm.updatedAt.getTime()) / 1000);
    const incrementSeconds = Math.max(secondsSinceUpdate, 120);

    const newTotalSeconds = vm.totalUptimeSeconds + incrementSeconds;
    const totalHours = newTotalSeconds / 3600;
    const estimatedCostCents = Math.round(totalHours * COST_CENTS_PER_HOUR);

    await updateCloudVMUptime(vm.id, newTotalSeconds, estimatedCostCents);

    uptimeUpdated++;
  }

  return NextResponse.json({
    ok: true,
    timedOut,
    uptimeUpdated,
    running: runningVMs.length,
  });
}
