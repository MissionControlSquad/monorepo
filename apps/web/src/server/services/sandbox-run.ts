/**
 * Tier D — the sandbox EXECUTION SEAM: actually run an agent's task inside a provisioned sandbox and
 * bring the result back. This is the control-plane orchestration that turns the SandboxProvider
 * building block into a working feature (provision → clone repo → materialise the task → run the
 * runtime command → capture → destroy). Ported from Paperclip's environment run-orchestrator
 * (acquire → realize → execute → release), simplified for our in-process provider model (ephemeral
 * per-run, no lease table / plugin-worker RPC).
 *
 * Provider-agnostic: the same seam drives `local` (real, no keys — what the tests exercise) and every
 * cloud provider (e2b/daytona/…). Credentials are BYO from the workspace vault via the provision ctx.
 */
import { GraphQLError } from "graphql";
import { buildAdapterInvocation } from "@agentcenter/utils";
import type { AgentContextBundle } from "@agentcenter/types";
import { prisma } from "@/server/prisma";
import { assembleContextBundle } from "./agent-context";
import { getSandboxProvider } from "./sandbox-providers";
import { resolveWorkspaceSecret } from "./secrets";

const MAX_OUTPUT_CHARS = 45_000;
const DEFAULT_TIMEOUT_MS = 600_000;

function shq(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** The task prompt written into the sandbox as TASK.md (mirrors the runner's taskMarkdown). */
function renderPrompt(b: AgentContextBundle): string {
  const t = b.task;
  const lines = [`# Task #${t.taskNumber}: ${t.title}`, "", t.description ?? "", ""];
  if (b.project?.repoUrl) lines.push(`Repo: ${b.project.repoUrl} @ ${b.project.repoRef ?? "HEAD"}`);
  return lines.join("\n");
}

export interface SandboxRunResult {
  providerKey: string;
  sandboxId: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** Derived from the exit: a clean exit → "review", anything else → "blocked". */
  status: "review" | "blocked";
}

/**
 * Run one task inside the agent's configured sandbox provider and return the captured result. Pure
 * orchestration + reads: it provisions, runs, captures, and always destroys the sandbox — it does not
 * write to the task timeline (the caller decides what to persist).
 */
export async function runTaskInSandbox(input: {
  workspaceId: string;
  taskId: string;
  agentId: string;
  /** Override the agent's configured provider (e.g. force `local`). */
  providerKey?: string | null;
  timeoutMs?: number;
}): Promise<SandboxRunResult> {
  const agent = await prisma.agent.findFirst({
    where: { id: input.agentId, workspaceId: input.workspaceId },
  });
  if (!agent) throw new GraphQLError("Agent not found", { extensions: { code: "NOT_FOUND" } });

  const providerKey = (input.providerKey ?? agent.sandboxProvider) || null;
  if (!providerKey) {
    throw new GraphQLError("No sandbox provider is configured for this agent", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  const provider = getSandboxProvider(providerKey);
  if (!provider) {
    throw new GraphQLError(`Unknown sandbox provider: ${providerKey}`, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const bundle = await assembleContextBundle(
    {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      personality: agent.personality ?? null,
      level: agent.level ?? null,
      runtimeAdapter: agent.runtimeAdapter ?? null,
      runtimeModel: agent.runtimeModel ?? null,
      runtimeTemplate: agent.runtimeTemplate ?? null,
      memoryProvider: agent.memoryProvider ?? null,
      workspaceId: agent.workspaceId ?? null,
    },
    input.taskId,
  );

  // Build the runtime command the sandbox will run. http-adapter runtimes have no in-sandbox command.
  const runtimeKey = bundle.runtime?.adapter ?? agent.runtimeAdapter ?? "shell";
  const invocation = buildAdapterInvocation(runtimeKey, {
    taskId: input.taskId,
    workspaceDir: "workspace",
    taskTitle: bundle.task.title,
    prompt: renderPrompt(bundle),
    template: bundle.runtime?.template ?? agent.runtimeTemplate ?? undefined,
    model: bundle.runtime?.model ?? agent.runtimeModel ?? null,
  });
  if (invocation.mode !== "spawn") {
    throw new GraphQLError("HTTP-adapter runtimes cannot run inside a sandbox", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const prompt = renderPrompt(bundle);
  const clone = bundle.project?.repoUrl
    ? `git clone --depth 1 ${shq(bundle.project.repoUrl)} repo && cd repo && `
    : "";
  // useShell → argv[0] is already a shell command string (run it as-is); otherwise argv is a real
  // argv the shell must exec with each token quoted.
  const runtimeCmd = invocation.useShell
    ? invocation.argv.join(" ")
    : invocation.argv.map(shq).join(" ");
  // One self-contained script: make a workspace, (clone repo), write the task, run the runtime.
  const script =
    `set -e\nmkdir -p workspace && cd workspace\n${clone}` +
    `cat > TASK.md <<'PC_TASK_EOF'\n${prompt}\nPC_TASK_EOF\n` +
    runtimeCmd;

  const ctx = {
    workspaceId: input.workspaceId,
    resolveSecret: (name: string) => resolveWorkspaceSecret(input.workspaceId, name),
  };

  const handle = await provider.provision(ctx);
  let exitCode: number | null;
  let stdout: string;
  let stderr: string;
  try {
    const result = await handle.exec(script, { timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS });
    exitCode = result.exitCode;
    stdout = result.stdout.slice(-MAX_OUTPUT_CHARS);
    stderr = result.stderr.slice(-MAX_OUTPUT_CHARS);
  } finally {
    // Always tear the sandbox down, even on failure — never leak a running sandbox.
    await handle.destroy().catch(() => {});
  }

  return {
    providerKey,
    sandboxId: handle.id,
    exitCode,
    stdout,
    stderr,
    status: exitCode === 0 ? "review" : "blocked",
  };
}
