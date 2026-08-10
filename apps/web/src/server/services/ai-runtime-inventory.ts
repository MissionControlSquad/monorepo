/**
 * AI Tools doctor - remote-runner inventory storage + runner-assisted install command builder.
 *
 * LOCAL detection lives in ai-runtime-detect (detectLocalRuntimes). This module adds the REMOTE side:
 * a runner posts its own detected RuntimeInventory (POST /api/runner/ai-tools) and we keep the latest
 * per runner so the UI can render a remote machine's tools next to the server's. It also builds the
 * least-privilege, idempotent install command we enqueue when a user asks a runner to install a tool -
 * `command -v <bin> || <recommendedInstall>` - reusing the researched catalog commands verbatim.
 */
import { prisma } from "@/server/prisma";
import type { RunnerToolInventory } from "@agentcenter/database";
import {
  getRuntimeTool,
  recommendedInstall,
  osFromPlatform,
  RUNTIME_OSES,
  type RuntimeOs,
} from "@agentcenter/utils";
import type { RuntimeInventory } from "./ai-runtime-detect";
import { badRequest } from "./service-errors";

/** Coerce an arbitrary string to a known RuntimeOs, or null. Accepts our enum or a Node platform. */
export function coerceOs(value: string | null | undefined): RuntimeOs | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if ((RUNTIME_OSES as readonly string[]).includes(v)) return v as RuntimeOs;
  // Tolerate a raw process.platform ("darwin" / "win32" / "linux") for convenience.
  if (v === "darwin" || v === "win32" || v === "linux") return osFromPlatform(v);
  return null;
}

export interface SaveReportedInventoryInput {
  workspaceId: string;
  runnerId: string;
  runnerName?: string | null;
  inventory: RuntimeInventory;
}

/** Upsert the latest inventory a runner reported about its own machine (one row per runner). */
export async function saveReportedInventory(
  input: SaveReportedInventoryInput,
): Promise<RunnerToolInventory> {
  const inv = input.inventory;
  const os = coerceOs(inv?.os);
  if (!os) badRequest("inventory.os must be macos, linux or windows");
  if (!Array.isArray(inv.tools)) badRequest("inventory.tools must be an array");
  const now = new Date();
  return prisma.runnerToolInventory.upsert({
    where: { workspaceId_runnerId: { workspaceId: input.workspaceId, runnerId: input.runnerId } },
    create: {
      workspaceId: input.workspaceId,
      runnerId: input.runnerId,
      runnerName: input.runnerName?.trim() || null,
      os,
      payload: inv as unknown as object,
      reportedAt: now,
    },
    update: {
      runnerName: input.runnerName?.trim() || null,
      os,
      payload: inv as unknown as object,
      reportedAt: now,
    },
  });
}

/** All runner-reported inventories for a workspace, newest report first. */
export function listReportedInventories(workspaceId: string): Promise<RunnerToolInventory[]> {
  return prisma.runnerToolInventory.findMany({
    where: { workspaceId },
    orderBy: { reportedAt: "desc" },
  });
}

/** The OS a given runner last reported, if any (used to pick the right install command). */
export async function reportedOsForRunner(
  workspaceId: string,
  runnerId: string,
): Promise<RuntimeOs | null> {
  const row = await prisma.runnerToolInventory.findUnique({
    where: { workspaceId_runnerId: { workspaceId, runnerId } },
    select: { os: true },
  });
  return coerceOs(row?.os);
}

/**
 * Build the idempotent, least-privilege install command for a runner to execute. Guarded with
 * `command -v <bin>` so a re-run is a no-op when the tool is already present. The install body is the
 * catalog's researched recommended command for the target OS - never user input, never re-invented.
 */
export function buildRunnerInstallCommand(toolKey: string, os: RuntimeOs): string {
  const tool = getRuntimeTool(toolKey);
  if (!tool) badRequest(`Unknown tool: ${toolKey}`);
  const method = recommendedInstall(tool, os);
  if (!method) badRequest(`No install method for ${toolKey} on ${os}`);
  // POSIX guard for macOS / Linux. Windows recommended commands are PowerShell/winget one-liners that
  // are themselves idempotent, so we run them directly there.
  if (os === "windows") return method.command;
  return `command -v ${tool.binName} >/dev/null 2>&1 || { ${method.command} ; }`;
}
