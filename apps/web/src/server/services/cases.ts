/**
 * Cases service (Epic #17). A Case is a support-ticket / work-item with a hierarchy, custom fields,
 * a status lifecycle, labels, task links, and an append-only event timeline. Workspace-scoped. Every
 * mutation funnels through `appendCaseEvent` so the timeline is never skipped.
 */
import { randomUUID } from "node:crypto";
import { CaseState as CaseStateConst } from "@agentcenter/utils";
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { Case, CaseState, CaseEventKind, CaseTaskRole } from "@agentcenter/database";

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}
function notFound(what: string): never {
  throw new GraphQLError(`${what} not found`, { extensions: { code: "NOT_FOUND" } });
}

/** Pure: the human identifier for a case number. */
export function caseIdentifier(caseNumber: number): string {
  return `CASE-${caseNumber}`;
}

/** Pure: done/cancelled stamp completedAt (preserving an existing one); any other status clears it. */
export function completedAtForStatus(status: CaseState, existing: Date | null): Date | null {
  if (status === CaseStateConst.DONE || status === CaseStateConst.CANCELLED)
    return existing ?? new Date();
  return null;
}

/** Append a case timeline event. Centralized so no mutation path skips the audit. */
export function appendCaseEvent(args: {
  workspaceId: string;
  caseId: string;
  kind: CaseEventKind;
  actorProfileId?: string | null;
  actorType?: string;
  payload?: Record<string, unknown> | null;
}) {
  return prisma.caseEvent.create({
    data: {
      workspaceId: args.workspaceId,
      caseId: args.caseId,
      kind: args.kind,
      actorType: args.actorType ?? (args.actorProfileId ? "user" : "system"),
      actorProfileId: args.actorProfileId ?? null,
      payload: (args.payload ?? undefined) as never,
    },
  });
}

async function loadCase(workspaceId: string, id: string) {
  const c = await prisma.case.findFirst({ where: { id, workspaceId } });
  if (!c) notFound("Case");
  return c;
}

export interface CreateCaseInput {
  workspaceId: string;
  title: string;
  caseType: string;
  summary?: string | null;
  projectId?: string | null;
  parentCaseId?: string | null;
  key?: string | null;
  fields?: Record<string, unknown> | null;
  createdByProfileId?: string | null;
}

export async function createCase(input: CreateCaseInput): Promise<Case> {
  const title = input.title.trim();
  const caseType = input.caseType.trim();
  if (!title) badRequest("title is required");
  if (!caseType) badRequest("caseType is required");
  if (input.parentCaseId) await loadCase(input.workspaceId, input.parentCaseId); // scope guard

  // caseNumber is assigned on insert; identifier derives from it → insert then set identifier.
  const created = await prisma.$transaction(async (tx) => {
    const c = await tx.case.create({
      data: {
        workspaceId: input.workspaceId,
        title,
        caseType,
        summary: input.summary ?? null,
        projectId: input.projectId ?? null,
        parentCaseId: input.parentCaseId ?? null,
        key: input.key ?? null,
        fields: (input.fields ?? {}) as never,
        createdByProfileId: input.createdByProfileId ?? null,
        identifier: `pending-${randomUUID()}`,
      },
    });
    return tx.case.update({
      where: { id: c.id },
      data: { identifier: caseIdentifier(c.caseNumber) },
    });
  });

  await appendCaseEvent({
    workspaceId: input.workspaceId,
    caseId: created.id,
    kind: "created",
    actorProfileId: input.createdByProfileId,
  });
  if (created.parentCaseId) {
    await appendCaseEvent({
      workspaceId: input.workspaceId,
      caseId: created.parentCaseId,
      kind: "child_linked",
      actorProfileId: input.createdByProfileId,
      payload: { childCaseId: created.id },
    });
  }
  return created;
}

export async function updateCase(
  workspaceId: string,
  id: string,
  patch: {
    title?: string | null;
    summary?: string | null;
    caseType?: string | null;
    fields?: Record<string, unknown> | null;
  },
  actorProfileId?: string | null,
): Promise<Case> {
  const existing = await loadCase(workspaceId, id);
  const fieldsChanged =
    patch.fields !== undefined && JSON.stringify(patch.fields) !== JSON.stringify(existing.fields);
  const updated = await prisma.case.update({
    where: { id },
    data: {
      ...(patch.title != null ? { title: patch.title.trim() } : {}),
      ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
      ...(patch.caseType != null ? { caseType: patch.caseType.trim() } : {}),
      ...(patch.fields !== undefined ? { fields: patch.fields as never } : {}),
    },
  });
  await appendCaseEvent({ workspaceId, caseId: id, kind: "updated", actorProfileId });
  if (fieldsChanged)
    await appendCaseEvent({ workspaceId, caseId: id, kind: "fields_changed", actorProfileId });
  return updated;
}

export async function setCaseStatus(
  workspaceId: string,
  id: string,
  status: CaseState,
  actorProfileId?: string | null,
): Promise<Case> {
  const existing = await loadCase(workspaceId, id);
  const completedAt = completedAtForStatus(status, existing.completedAt);
  const updated = await prisma.case.update({ where: { id }, data: { status, completedAt } });
  await appendCaseEvent({
    workspaceId,
    caseId: id,
    kind: "status_changed",
    actorProfileId,
    payload: { from: existing.status, to: status },
  });
  return updated;
}

export async function linkTaskToCase(args: {
  workspaceId: string;
  caseId: string;
  taskId: string;
  role: CaseTaskRole;
  actorProfileId?: string | null;
}) {
  await loadCase(args.workspaceId, args.caseId);
  const dup = await prisma.caseTaskLink.findFirst({
    where: { caseId: args.caseId, taskId: args.taskId },
  });
  if (dup) badRequest("task already linked to this case");
  const link = await prisma.caseTaskLink.create({
    data: {
      workspaceId: args.workspaceId,
      caseId: args.caseId,
      taskId: args.taskId,
      role: args.role,
    },
  });
  await appendCaseEvent({
    workspaceId: args.workspaceId,
    caseId: args.caseId,
    kind: "task_linked",
    actorProfileId: args.actorProfileId,
    payload: { taskId: args.taskId, role: args.role },
  });
  return link;
}

export async function unlinkTaskFromCase(args: {
  workspaceId: string;
  caseId: string;
  taskId: string;
  actorProfileId?: string | null;
}): Promise<boolean> {
  const res = await prisma.caseTaskLink.deleteMany({
    where: { caseId: args.caseId, taskId: args.taskId, workspaceId: args.workspaceId },
  });
  if (res.count === 0) return false;
  await appendCaseEvent({
    workspaceId: args.workspaceId,
    caseId: args.caseId,
    kind: "task_unlinked",
    actorProfileId: args.actorProfileId,
    payload: { taskId: args.taskId },
  });
  return true;
}

export async function createLabel(workspaceId: string, name: string, color: string) {
  const n = name.trim();
  if (!n) badRequest("label name is required");
  const dup = await prisma.label.findFirst({ where: { workspaceId, name: n } });
  if (dup) badRequest(`a label named "${n}" already exists`);
  return prisma.label.create({ data: { workspaceId, name: n, color: color || "#888888" } });
}

export async function addCaseLabel(args: {
  workspaceId: string;
  caseId: string;
  labelId: string;
  actorProfileId?: string | null;
}) {
  await loadCase(args.workspaceId, args.caseId);
  const label = await prisma.label.findFirst({
    where: { id: args.labelId, workspaceId: args.workspaceId },
  });
  if (!label) notFound("Label");
  const dup = await prisma.caseLabel.findFirst({
    where: { caseId: args.caseId, labelId: args.labelId },
  });
  if (dup) return dup;
  const cl = await prisma.caseLabel.create({
    data: { workspaceId: args.workspaceId, caseId: args.caseId, labelId: args.labelId },
  });
  await appendCaseEvent({
    workspaceId: args.workspaceId,
    caseId: args.caseId,
    kind: "label_added",
    actorProfileId: args.actorProfileId,
    payload: { labelId: args.labelId },
  });
  return cl;
}

export async function removeCaseLabel(args: {
  workspaceId: string;
  caseId: string;
  labelId: string;
  actorProfileId?: string | null;
}): Promise<boolean> {
  const res = await prisma.caseLabel.deleteMany({
    where: { caseId: args.caseId, labelId: args.labelId, workspaceId: args.workspaceId },
  });
  if (res.count === 0) return false;
  await appendCaseEvent({
    workspaceId: args.workspaceId,
    caseId: args.caseId,
    kind: "label_removed",
    actorProfileId: args.actorProfileId,
    payload: { labelId: args.labelId },
  });
  return true;
}

export async function attachCaseDocument(args: {
  workspaceId: string;
  caseId: string;
  documentId: string;
  key: string;
  actorProfileId?: string | null;
}) {
  await loadCase(args.workspaceId, args.caseId);
  const key = args.key.trim();
  if (!/^[A-Za-z0-9_.:-]+$/.test(key)) badRequest("key must match [A-Za-z0-9_.:-]+");
  const doc = await prisma.caseDocument.create({
    data: {
      workspaceId: args.workspaceId,
      caseId: args.caseId,
      documentId: args.documentId,
      key,
    },
  });
  await appendCaseEvent({
    workspaceId: args.workspaceId,
    caseId: args.caseId,
    kind: "document_attached",
    actorProfileId: args.actorProfileId,
    payload: { documentId: args.documentId, key },
  });
  return doc;
}
