import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";
import { env } from "@/server/env";
import { deleteServer, deleteSSHKey } from "@/server/services/hetzner";

// VMs stuck in any setup state for > 20 minutes are considered timed out
const SETUP_TIMEOUT_MS = 20 * 60 * 1000;

// CX22 cost: ~$4.49/mo ~ 0.6 cents/hour
const COST_CENTS_PER_HOUR = 0.6;

const SETUP_STATUSES = [
  "provisioning",
  "waiting_for_ssh",
  "installing_deps",
  "installing_openclaw",
  "configuring",
  "starting_service",
] as const;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  let timedOut = 0;
  let uptimeUpdated = 0;

  // 1. VMs stuck in any setup state > 20 minutes
  const stuckVMs = await prisma.cloudVM.findMany({
    where: {
      status: { in: [...SETUP_STATUSES] },
      updatedAt: { lt: new Date(now.getTime() - SETUP_TIMEOUT_MS) },
    },
  });

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

    await prisma.cloudVM.update({
      where: { id: vm.id },
      data: {
        status: "error",
        errorMessage: `Timed out during setup (stuck in "${vm.status}" for >20 min)`,
        errorAt: now,
        setupStep: null,
      },
    });

    await prisma.cloudVMLog.create({
      data: {
        vmId: vm.id,
        message: `Timed out during setup (status: ${vm.status})`,
        level: "error",
      },
    });

    timedOut++;
  }

  // 2. Update uptime and estimated cost for running VMs
  const runningVMs = await prisma.cloudVM.findMany({
    where: { status: "running" },
  });

  for (const vm of runningVMs) {
    const secondsSinceUpdate = Math.floor((now.getTime() - vm.updatedAt.getTime()) / 1000);
    const incrementSeconds = Math.max(secondsSinceUpdate, 120);

    const newTotalSeconds = vm.totalUptimeSeconds + incrementSeconds;
    const totalHours = newTotalSeconds / 3600;
    const estimatedCostCents = Math.round(totalHours * COST_CENTS_PER_HOUR);

    await prisma.cloudVM.update({
      where: { id: vm.id },
      data: {
        totalUptimeSeconds: newTotalSeconds,
        estimatedCostCents,
      },
    });

    uptimeUpdated++;
  }

  return NextResponse.json({
    ok: true,
    timedOut,
    uptimeUpdated,
    running: runningVMs.length,
  });
}
