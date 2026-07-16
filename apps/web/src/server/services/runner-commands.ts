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
import { sshExec, type SSHConfig } from "./ssh";
import { getVMSSHConfig } from "./cloud-vm-utils";
import { resolveHostSSHConfig } from "./runner-hosts";

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

/** Cap persisted output so a runaway command can't write an unbounded DB row. */
const MAX_OUTPUT_BYTES = 64_000;
export function capOutput(s: string | null | undefined): string | null {
  if (s == null) return null;
  if (s.length <= MAX_OUTPUT_BYTES) return s;
  const kept = s.slice(0, MAX_OUTPUT_BYTES);
  return `${kept}\n…[truncated ${s.length - MAX_OUTPUT_BYTES} chars]`;
}

/** Resolve the SSHConfig for an SSH-reachable target (cloud_vm or host). */
async function resolveTargetSshConfig(
  workspaceId: string,
  targetKind: string,
  targetId: string,
): Promise<SSHConfig> {
  if (targetKind === "cloud_vm") {
    const vm = await prisma.cloudVM.findFirst({
      where: { id: targetId, workspaceId },
      select: { id: true, ipv4: true, sshPrivateKey: true },
    });
    if (!vm) notFound("Target VM not found");
    return getVMSSHConfig(vm);
  }
  if (targetKind === "host") {
    return resolveHostSSHConfig(workspaceId, targetId);
  }
  return badRequest(
    `Server-side execution only supports cloud_vm and host targets (got ${targetKind})`,
  );
}

/**
 * Execute a queued command against an SSH-reachable target (cloud_vm or host) and persist the result
 * on the row. Marks running → done/failed/timeout. Idempotent-ish: only runs if queued. The `agent`
 * target kind is NOT server-executed — its runner daemon pulls it via the poll endpoints instead.
 */
export async function runQueuedCommand(workspaceId: string, id: string): Promise<RunnerCommand> {
  const cmd = await prisma.runnerCommand.findFirst({ where: { id, workspaceId } });
  if (!cmd) notFound("Runner command not found");
  if (cmd.status !== "queued") badRequest(`Command is not queued (status: ${cmd.status})`);

  // Resolve credentials BEFORE flipping to running, so a bad target leaves the row queued.
  const sshConfig = await resolveTargetSshConfig(workspaceId, cmd.targetKind, cmd.targetId);

  await prisma.runnerCommand.update({
    where: { id: cmd.id },
    data: { status: "running", claimedAt: new Date(), startedAt: new Date() },
  });

  try {
    const result = await sshExec(sshConfig, withCwd(cmd.command, cmd.cwd), {
      timeoutMs: cmd.timeoutMs,
    });
    return prisma.runnerCommand.update({
      where: { id: cmd.id },
      data: {
        status: "done",
        exitCode: result.code,
        stdout: capOutput(result.stdout),
        stderr: capOutput(result.stderr),
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

/** Create + immediately execute against a registered BYO host over direct SSH. */
export async function runCommandOnHost(input: {
  workspaceId: string;
  hostId: string;
  command: string;
  cwd?: string | null;
  timeoutMs?: number | null;
  requestedByProfileId?: string | null;
}): Promise<RunnerCommand> {
  const created = await createRunnerCommand({
    workspaceId: input.workspaceId,
    targetKind: "host",
    targetId: input.hostId,
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

// ─── Agent-daemon pull path (outbound-only runners behind NAT, Slice 2) ─────

/**
 * Atomically claim this agent's queued commands and return the claimed rows. Each row's transition
 * queued → running is guarded by an updateMany on status=queued, so two concurrent pollers can never
 * both win the same command (only one updateMany reports count===1). Mirrors the task-checkout lease.
 */
export async function claimCommandsForAgent(
  agentId: string,
  workspaceId: string,
  limit = 10,
): Promise<RunnerCommand[]> {
  const candidates = await prisma.runnerCommand.findMany({
    where: { targetKind: "agent", targetId: agentId, workspaceId, status: "queued" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: Math.min(limit, 50),
  });
  const now = new Date();
  const claimedIds: string[] = [];
  for (const c of candidates) {
    const res = await prisma.runnerCommand.updateMany({
      where: { id: c.id, status: "queued" },
      data: { status: "running", claimedAt: now, startedAt: now },
    });
    if (res.count === 1) claimedIds.push(c.id);
  }
  if (claimedIds.length === 0) return [];
  return prisma.runnerCommand.findMany({
    where: { id: { in: claimedIds } },
    orderBy: { createdAt: "asc" },
  });
}

export interface CommandResultInput {
  exitCode?: number | null;
  stdout?: string | null;
  stderr?: string | null;
  status?: "done" | "failed" | "timeout" | null;
  errorMessage?: string | null;
}

/**
 * Record a result posted by an agent daemon for a command it claimed. Scoped to the agent
 * (targetKind=agent, targetId=agentId) and only accepts a row that is currently running.
 */
export async function recordCommandResult(
  agentId: string,
  workspaceId: string,
  id: string,
  result: CommandResultInput,
): Promise<RunnerCommand> {
  const cmd = await prisma.runnerCommand.findFirst({
    where: { id, workspaceId, targetKind: "agent", targetId: agentId },
  });
  if (!cmd) notFound("Runner command not found");
  if (cmd.status !== "running") badRequest(`Command is not running (status: ${cmd.status})`);

  const finalStatus =
    result.status ?? (result.errorMessage && result.exitCode == null ? "failed" : "done");
  return prisma.runnerCommand.update({
    where: { id: cmd.id },
    data: {
      status: finalStatus,
      exitCode: result.exitCode ?? null,
      stdout: capOutput(result.stdout),
      stderr: capOutput(result.stderr),
      errorMessage: capOutput(result.errorMessage),
      finishedAt: new Date(),
    },
  });
}
