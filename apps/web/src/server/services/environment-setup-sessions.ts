import { prisma } from "@/server/prisma";
import type { EnvironmentCustomImageSetupSession } from "@agentcenter/database";
import { setupSessionNext, SetupSessionError, type SetupSessionStatus } from "@agentcenter/utils";
import { captureCustomImage } from "@/server/services/environment-custom-images";
import { badRequest } from "./service-errors";

// Custom-image setup-session lifecycle (parity #47/#48). Orchestrates the existing TerminalSession (SSH
// PTY, #48 broker) and image capture into an interactive "configure a box, then snapshot it" flow. The
// pure state machine guards transitions; the provider snapshot is the only infra seam (injectable here
// so the lifecycle is testable offline). Workspace-scoped; CUSTOM_IMAGES-gated at the resolver.

const DEFAULT_TTL_MS = 60 * 60_000; // 1h

/** A capture function: (workspaceId, environmentId) → the id of the created custom-image template. */
export type CaptureFn = (workspaceId: string, environmentId: string) => Promise<string>;

const defaultCapture: CaptureFn = async (workspaceId, environmentId) => {
  const tpl = await captureCustomImage(workspaceId, environmentId);
  return tpl.id;
};

export async function startSetupSession(input: {
  workspaceId: string;
  environmentId: string;
  baseTemplateId?: string | null;
  terminalSessionId?: string | null;
  connectionSummary?: unknown;
  ttlMs?: number;
  createdByProfileId?: string | null;
}): Promise<EnvironmentCustomImageSetupSession> {
  if (!input.environmentId?.trim()) badRequest("environmentId is required");
  return prisma.environmentCustomImageSetupSession.create({
    data: {
      workspaceId: input.workspaceId,
      environmentId: input.environmentId,
      baseTemplateId: input.baseTemplateId ?? null,
      terminalSessionId: input.terminalSessionId ?? null,
      connectionSummary: (input.connectionSummary ?? undefined) as never,
      expiresAt: new Date(Date.now() + Math.max(60_000, input.ttlMs ?? DEFAULT_TTL_MS)),
      createdByProfileId: input.createdByProfileId ?? null,
    },
  });
}

async function load(workspaceId: string, id: string): Promise<EnvironmentCustomImageSetupSession> {
  const s = await prisma.environmentCustomImageSetupSession.findFirst({
    where: { id, workspaceId },
  });
  if (!s) badRequest("Setup session not found");
  return s;
}

/** Bind (or rebind) the terminal issuing this session's SSH PTY (#48). */
export async function attachSetupTerminal(
  workspaceId: string,
  id: string,
  terminalSessionId: string,
): Promise<EnvironmentCustomImageSetupSession> {
  const s = await load(workspaceId, id);
  if (s.status !== "active") badRequest(`cannot attach a terminal to a ${s.status} session`);
  return prisma.environmentCustomImageSetupSession.update({
    where: { id },
    data: { terminalSessionId },
  });
}

/**
 * Finish a session by snapshotting the configured box into a custom image. Transitions active →
 * capturing → captured (with resultTemplateId) or failed (with lastError). `capture` overrides the
 * provider snapshot for tests.
 */
export async function finishSetupSession(
  workspaceId: string,
  id: string,
  capture: CaptureFn = defaultCapture,
): Promise<EnvironmentCustomImageSetupSession> {
  const s = await load(workspaceId, id);
  let capturing: SetupSessionStatus;
  try {
    capturing = setupSessionNext(s.status as SetupSessionStatus, "beginCapture");
  } catch (err) {
    if (err instanceof SetupSessionError) badRequest(err.message);
    throw err;
  }
  await prisma.environmentCustomImageSetupSession.update({
    where: { id },
    data: { status: capturing },
  });

  try {
    const resultTemplateId = await capture(workspaceId, s.environmentId);
    return prisma.environmentCustomImageSetupSession.update({
      where: { id },
      data: { status: setupSessionNext(capturing, "captureOk"), resultTemplateId, lastError: null },
    });
  } catch (err) {
    return prisma.environmentCustomImageSetupSession.update({
      where: { id },
      data: {
        status: setupSessionNext(capturing, "captureFail"),
        lastError: (err as Error).message.slice(0, 2000),
      },
    });
  }
}

/** Operator-cancel an active/capturing session. */
export async function abortSetupSession(
  workspaceId: string,
  id: string,
): Promise<EnvironmentCustomImageSetupSession> {
  const s = await load(workspaceId, id);
  try {
    const next = setupSessionNext(s.status as SetupSessionStatus, "abort");
    return prisma.environmentCustomImageSetupSession.update({
      where: { id },
      data: { status: next },
    });
  } catch (err) {
    if (err instanceof SetupSessionError) badRequest(err.message);
    throw err;
  }
}

export function getSetupSession(
  workspaceId: string,
  id: string,
): Promise<EnvironmentCustomImageSetupSession | null> {
  return prisma.environmentCustomImageSetupSession.findFirst({ where: { id, workspaceId } });
}

export function listSetupSessions(
  workspaceId: string,
  environmentId?: string,
): Promise<EnvironmentCustomImageSetupSession[]> {
  return prisma.environmentCustomImageSetupSession.findMany({
    where: { workspaceId, ...(environmentId ? { environmentId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

/**
 * Reaper (cron): expire active sessions past their TTL so a never-finished setup box doesn't linger.
 * Returns the count expired. Workspace-scoped; pass no workspaceId sweep across all (heartbeat use).
 */
export async function cleanupExpiredSetupSessions(workspaceId?: string): Promise<number> {
  const { count } = await prisma.environmentCustomImageSetupSession.updateMany({
    where: {
      status: "active",
      expiresAt: { lte: new Date() },
      ...(workspaceId ? { workspaceId } : {}),
    },
    data: { status: "expired" },
  });
  return count;
}
