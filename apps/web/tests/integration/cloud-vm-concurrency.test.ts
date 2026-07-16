import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { tryBeginCloudVMDestroy } from "@agentcenter/database";

// Tier D robustness: the atomic destroy-claim so two concurrent destroy calls can't both tear down
// and delete the same (billable) Hetzner server. (The full provision/destroy resurrection race also
// needs the provision loop to re-check status — infra-verify-only, out of scope here.)
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE cloud_vms CASCADE`);
});

describe("cloud-vm destroy concurrency guard (Tier D)", () => {
  it("two concurrent destroy claims → exactly one wins; VM becomes destroying", async () => {
    const vm = await prisma.cloudVM.create({ data: { status: "running", workspaceId: "ws" } });
    const [a, b] = await Promise.all([
      tryBeginCloudVMDestroy(vm.id),
      tryBeginCloudVMDestroy(vm.id),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const row = await prisma.cloudVM.findUniqueOrThrow({ where: { id: vm.id } });
    expect(row.status).toBe("destroying");
  });

  it("claiming an already-destroyed VM fails", async () => {
    const vm = await prisma.cloudVM.create({ data: { status: "destroyed", workspaceId: "ws" } });
    expect(await tryBeginCloudVMDestroy(vm.id)).toBe(false);
  });

  it("claiming an already-destroying VM fails (idempotent guard)", async () => {
    const vm = await prisma.cloudVM.create({ data: { status: "destroying", workspaceId: "ws" } });
    expect(await tryBeginCloudVMDestroy(vm.id)).toBe(false);
  });
});
