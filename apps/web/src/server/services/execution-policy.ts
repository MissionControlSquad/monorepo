/**
 * Tier D / Phase 3 (Plan 4) — workspace execution policy + the PURE execution-allowlist guard
 * (ported from Paperclip's execution-allowlist). The guard decides whether a run may execute on a
 * given {driver, provider} under the workspace's policy. `executionMode = kubernetes` forces every run
 * onto an ISOLATING kubernetes sandbox and denies local/ssh/plugin/non-k8s — the containment story for
 * untrusted tenants. It is evaluated fail-closed BEFORE any sandbox is provisioned.
 */
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";

export type ExecutionMode = "any" | "kubernetes";
export const EXECUTION_MODES: ExecutionMode[] = ["any", "kubernetes"];

export interface ExecutionPolicy {
  executionMode: ExecutionMode;
  enableIsolatedWorkspaces: boolean;
}

export const DEFAULT_EXECUTION_POLICY: ExecutionPolicy = {
  executionMode: "any",
  enableIsolatedWorkspaces: false,
};

export interface ExecutionTarget {
  driver: string; // local | ssh | sandbox | plugin
  provider?: string | null; // sandbox provider key when driver = sandbox
}

export interface AllowlistDecision {
  allowed: boolean;
  reason?: string;
}

/**
 * PURE, DB-free. When `executionMode = kubernetes`, the ONLY permitted target is the kubernetes
 * sandbox provider; every other driver/provider is denied. `any` permits everything.
 */
export function evaluateExecutionAllowlist(
  policy: ExecutionPolicy,
  target: ExecutionTarget,
): AllowlistDecision {
  if (policy.executionMode !== "kubernetes") return { allowed: true };
  if (target.driver !== "sandbox") {
    return {
      allowed: false,
      reason: `Workspace execution mode is "kubernetes" — driver "${target.driver}" is not allowed. Use an isolated kubernetes sandbox.`,
    };
  }
  if (target.provider !== "kubernetes") {
    return {
      allowed: false,
      reason: `Workspace execution mode is "kubernetes" — sandbox provider "${target.provider ?? "?"}" is not allowed. Only the kubernetes provider is permitted.`,
    };
  }
  return { allowed: true };
}

// ── policy persistence ──────────────────────────────────────────────────────
export async function getWorkspaceExecutionPolicy(workspaceId: string): Promise<ExecutionPolicy> {
  const row = await prisma.workspaceExecutionPolicy.findUnique({ where: { workspaceId } });
  if (!row) return { ...DEFAULT_EXECUTION_POLICY };
  return {
    executionMode: (row.executionMode as ExecutionMode) ?? "any",
    enableIsolatedWorkspaces: row.enableIsolatedWorkspaces,
  };
}

export async function setWorkspaceExecutionMode(
  workspaceId: string,
  input: { executionMode?: ExecutionMode; enableIsolatedWorkspaces?: boolean },
  updatedByProfileId?: string | null,
): Promise<ExecutionPolicy> {
  if (input.executionMode && !EXECUTION_MODES.includes(input.executionMode)) {
    throw new GraphQLError(`Unknown execution mode: ${input.executionMode}`, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  const row = await prisma.workspaceExecutionPolicy.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      executionMode: input.executionMode ?? "any",
      enableIsolatedWorkspaces: input.enableIsolatedWorkspaces ?? false,
      updatedByProfileId: updatedByProfileId ?? null,
    },
    update: {
      ...(input.executionMode !== undefined ? { executionMode: input.executionMode } : {}),
      ...(input.enableIsolatedWorkspaces !== undefined
        ? { enableIsolatedWorkspaces: input.enableIsolatedWorkspaces }
        : {}),
      updatedByProfileId: updatedByProfileId ?? null,
    },
  });
  return {
    executionMode: row.executionMode as ExecutionMode,
    enableIsolatedWorkspaces: row.enableIsolatedWorkspaces,
  };
}

/**
 * Enforce the allowlist for a workspace + target, fail-closed. Throws a FORBIDDEN GraphQLError if the
 * policy denies the target. No-op when EXECUTION_POLICY is not gating (caller decides) — here it always
 * consults the stored policy (default `any` = permit), so it is cheap and safe to call unconditionally.
 */
export async function assertExecutionAllowed(
  workspaceId: string,
  target: ExecutionTarget,
): Promise<void> {
  const policy = await getWorkspaceExecutionPolicy(workspaceId);
  const decision = evaluateExecutionAllowlist(policy, target);
  if (!decision.allowed) {
    throw new GraphQLError(decision.reason ?? "Execution denied by workspace policy", {
      extensions: { code: "FORBIDDEN" },
    });
  }
}
