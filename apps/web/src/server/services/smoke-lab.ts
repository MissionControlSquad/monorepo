import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { SmokeCase } from "@agentcenter/database";
import { admitToolCall } from "@/server/services/tool-gateway";

// Tool smoke-lab (parity #153). Saved cases asserting how a tool call should be admitted; running one
// drives the real tool gateway (access policy + content guards + plugin routing) and records pass/fail,
// so an operator can validate their config before agents depend on it. Workspace-scoped.

const DECISIONS = new Set(["allow", "deny"]);

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

export async function createSmokeCase(input: {
  workspaceId: string;
  name: string;
  toolName: string;
  agentId?: string | null;
  inputText?: string | null;
  expectDecision: string;
  createdByProfileId?: string | null;
}): Promise<SmokeCase> {
  if (!input.name?.trim()) badRequest("name is required");
  if (!input.toolName?.trim()) badRequest("toolName is required");
  if (!DECISIONS.has(input.expectDecision)) badRequest("expectDecision must be allow or deny");
  return prisma.smokeCase.create({
    data: {
      workspaceId: input.workspaceId,
      name: input.name.trim(),
      toolName: input.toolName.trim(),
      agentId: input.agentId ?? null,
      inputText: input.inputText ?? null,
      expectDecision: input.expectDecision,
      createdByProfileId: input.createdByProfileId ?? null,
    },
  });
}

export function listSmokeCases(workspaceId: string): Promise<SmokeCase[]> {
  return prisma.smokeCase.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
}

export async function deleteSmokeCase(workspaceId: string, id: string): Promise<boolean> {
  const { count } = await prisma.smokeCase.deleteMany({ where: { id, workspaceId } });
  return count > 0;
}

export interface SmokeResult {
  caseId: string;
  name: string;
  result: "pass" | "fail" | "error";
  expected: string;
  actual: string;
  detail?: string;
}

/** Run one saved case through the gateway and record its outcome. */
export async function runSmokeCase(workspaceId: string, id: string): Promise<SmokeResult> {
  const c = await prisma.smokeCase.findFirst({ where: { id, workspaceId } });
  if (!c) badRequest("Smoke case not found");

  let actual: string;
  let result: "pass" | "fail" | "error";
  let detail: string | undefined;
  try {
    const admission = await admitToolCall({
      workspaceId,
      agentId: c.agentId,
      toolName: c.toolName,
      inputText: c.inputText ?? undefined,
    });
    actual = admission.allowed ? "allow" : "deny";
    result = actual === c.expectDecision ? "pass" : "fail";
    detail = admission.reason;
  } catch (err) {
    actual = "error";
    result = "error";
    detail = (err as Error).message;
  }

  await prisma.smokeCase.update({
    where: { id },
    data: { lastResult: result, lastActual: actual, lastRunAt: new Date() },
  });
  return { caseId: c.id, name: c.name, result, expected: c.expectDecision, actual, detail };
}

/** Run every case in the workspace; returns per-case results + a summary. */
export async function runSmokeSuite(
  workspaceId: string,
): Promise<{ results: SmokeResult[]; passed: number; failed: number; errored: number }> {
  const cases = await prisma.smokeCase.findMany({ where: { workspaceId } });
  const results: SmokeResult[] = [];
  for (const c of cases) results.push(await runSmokeCase(workspaceId, c.id));
  return {
    results,
    passed: results.filter((r) => r.result === "pass").length,
    failed: results.filter((r) => r.result === "fail").length,
    errored: results.filter((r) => r.result === "error").length,
  };
}
