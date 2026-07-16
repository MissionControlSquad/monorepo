/**
 * Tier D: runner commands — raw shell/CLI jobs on a runner, WITHOUT an agent runtime.
 *
 * This is the "trigger CLI without OpenClaw" primitive. One `RunnerCommand` model, two movers:
 *   • cloud_vm / host target → the SERVER executes it here via sshExec (this file, Slice 1).
 *   • agent target → an outbound runner daemon pulls + posts results (poll endpoints, Slice 2).
 *
 * Nothing here is OpenClaw-specific: sshExec runs an arbitrary command. RUNNERS-gated at the edge.
 */
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { RunnerCommand } from "@agentcenter/database";
import { sshExec } from "./ssh";
import { getVMSSHConfig } from "./cloud-vm-utils";

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

function notFound(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "NOT_FOUND" } });
}

export interface CreateRunnerCommandInput {
  workspaceId: string;
  targetKind: "cloud_vm" | "agent" | "host";
  targetId: string;
  command: string;
  cwd?: string | null;
  timeoutMs?: number | null;
  requestedByProfileId?: string | null;
}

/** Create a queued runner command. Does NOT execute — call runQueuedCommand for cloud_vm/host. */
export async function createRunnerCommand(input: CreateRunnerCommandInput): Promise<RunnerCommand> {
  const command = input.command.trim();
  if (!command) badRequest("command is required");
  if (input.timeoutMs != null && (!Number.isInteger(input.timeoutMs) || input.timeoutMs <= 0))
    badRequest("timeoutMs must be a positive integer");
  return prisma.runnerCommand.create({
    data: {
      workspaceId: input.workspaceId,
      targetKind: input.targetKind,
      targetId: input.targetId,
      command,
      cwd: input.cwd?.trim() || null,
      timeoutMs: input.timeoutMs ?? 120_000,
      requestedByProfileId: input.requestedByProfileId ?? null,
    },
  });
}

/** Wrap a command with an optional `cd <cwd> && ...` prefix. */
function withCwd(command: string, cwd?: string | null): string {
  if (!cwd) return command;
  // Single-quote the cwd so shell metacharacters in the path can't break out.
  return `cd '${cwd.replace(/'/g, "'\\''")}' && ${command}`;
}

/**
 * Execute a queued command against an SSH-reachable target (cloud_vm only in Slice 1) and persist
 * the result on the row. Marks running → done/failed/timeout. Idempotent-ish: only runs if queued.
 */
export async function runQueuedCommand(workspaceId: string, id: string): Promise<RunnerCommand> {
  const cmd = await prisma.runnerCommand.findFirst({ where: { id, workspaceId } });
  if (!cmd) notFound("Runner command not found");
  if (cmd.status !== "queued") badRequest(`Command is not queued (status: ${cmd.status})`);
  if (cmd.targetKind !== "cloud_vm")
    badRequest(`Server-side execution only supports cloud_vm targets (got ${cmd.targetKind})`);

  const vm = await prisma.cloudVM.findFirst({
    where: { id: cmd.targetId, workspaceId },
    select: { id: true, ipv4: true, sshPrivateKey: true },
  });
  if (!vm) notFound("Target VM not found");

  await prisma.runnerCommand.update({
    where: { id: cmd.id },
    data: { status: "running", claimedAt: new Date(), startedAt: new Date() },
  });

  try {
    const sshConfig = getVMSSHConfig(vm);
    const result = await sshExec(sshConfig, withCwd(cmd.command, cmd.cwd), {
      timeoutMs: cmd.timeoutMs,
    });
    return prisma.runnerCommand.update({
      where: { id: cmd.id },
      data: {
        status: "done",
        exitCode: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
        finishedAt: new Date(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const timedOut = /timed out/i.test(message);
    return prisma.runnerCommand.update({
      where: { id: cmd.id },
      data: {
        status: timedOut ? "timeout" : "failed",
        errorMessage: message,
        finishedAt: new Date(),
      },
    });
  }
}

/** Create + immediately execute against a cloud VM. Convenience for the GraphQL mutation. */
export async function runCommandOnVM(input: {
  workspaceId: string;
  vmId: string;
  command: string;
  cwd?: string | null;
  timeoutMs?: number | null;
  requestedByProfileId?: string | null;
}): Promise<RunnerCommand> {
  const created = await createRunnerCommand({
    workspaceId: input.workspaceId,
    targetKind: "cloud_vm",
    targetId: input.vmId,
    command: input.command,
    cwd: input.cwd,
    timeoutMs: input.timeoutMs,
    requestedByProfileId: input.requestedByProfileId,
  });
  return runQueuedCommand(input.workspaceId, created.id);
}

export async function listRunnerCommands(
  workspaceId: string,
  opts?: { targetKind?: string; targetId?: string; limit?: number },
): Promise<RunnerCommand[]> {
  return prisma.runnerCommand.findMany({
    where: {
      workspaceId,
      ...(opts?.targetKind ? { targetKind: opts.targetKind as never } : {}),
      ...(opts?.targetId ? { targetId: opts.targetId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(opts?.limit ?? 50, 200),
  });
}

/** Cancel a command that hasn't finished. Returns true if a row transitioned to canceled. */
export async function cancelRunnerCommand(workspaceId: string, id: string): Promise<boolean> {
  const res = await prisma.runnerCommand.updateMany({
    where: { id, workspaceId, status: { in: ["queued", "running"] } },
    data: { status: "canceled", finishedAt: new Date() },
  });
  return res.count > 0;
}
