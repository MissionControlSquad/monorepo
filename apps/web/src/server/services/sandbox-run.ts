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
import {
  buildAdapterInvocation,
  getAdapter,
  requiresSandboxContainment,
  type TrustLevel,
} from "@agentcenter/utils";
import type { AgentContextBundle } from "@agentcenter/types";
import { prisma } from "@/server/prisma";
import { assembleContextBundle } from "./agent-context";
import { getSandboxProvider } from "./sandbox-providers";
import { resolveWorkspaceSecret, resolveEnvForAgent } from "./secrets";

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

/**
 * Compose the self-contained shell script the sandbox runs. Pure (exported for tests). Order matters:
 * export the agent's secrets first (so clone auth + the runtime see them), make a workspace, clone the
 * repo, write the task, INSTALL the runtime binary (idempotent), then run it.
 */
export function composeSandboxScript(opts: {
  prompt: string;
  repoUrl?: string | null;
  runtimeCmd: string;
  /** `command -v <bin> || <install>` — installs the runtime binary if missing. */
  installGuard?: string | null;
  /** The agent's bound secrets (LLM API keys, etc.) exported into the box. */
  env?: Record<string, string>;
}): string {
  const exports = Object.entries(opts.env ?? {})
    .map(([k, v]) => `export ${k}=${shq(v)}`)
    .join("\n");
  const clone = opts.repoUrl ? `git clone --depth 1 ${shq(opts.repoUrl)} repo && cd repo && ` : "";
  return (
    `set -e\n` +
    (exports ? `${exports}\n` : "") +
    `mkdir -p workspace && cd workspace\n${clone}` +
    `cat > TASK.md <<'PC_TASK_EOF'\n${opts.prompt}\nPC_TASK_EOF\n` +
    (opts.installGuard ? `${opts.installGuard}\n` : "") +
    opts.runtimeCmd
  );
}

export interface SandboxRunResult {
  /** The persisted AgentRun id (run ledger row for this execution). */
  runId: string;
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
  /** buildbase userId who triggered the run (for the run ledger). */
  requestedByProfileId?: string | null;
}): Promise<SandboxRunResult> {
  const agent = await prisma.agent.findFirst({
    where: { id: input.agentId, workspaceId: input.workspaceId },
    include: { trustProfile: true },
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

  // Fail-closed admission: a low-trust/untrusted (or explicitly contained) agent must run in an
  // ISOLATING sandbox — never on the control-plane host (the `local` provider).
  const trustLevel = (agent.trustLevel ?? "standard") as TrustLevel;
  if (
    requiresSandboxContainment({
      trustLevel,
      lowTrustContainment: agent.trustProfile?.lowTrustContainment,
    }) &&
    !provider.isolating
  ) {
    throw new GraphQLError(
      `Agent is ${trustLevel}-trust and must run in an isolated sandbox — provider "${providerKey}" runs on the host. Configure an isolating cloud sandbox provider.`,
      { extensions: { code: "FORBIDDEN" } },
    );
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
  // useShell → argv[0] is already a shell command string (run it as-is); otherwise argv is a real
  // argv the shell must exec with each token quoted.
  const runtimeCmd = invocation.useShell
    ? invocation.argv.join(" ")
    : invocation.argv.map(shq).join(" ");
  // Install the runtime binary in a fresh box if the adapter declares one (idempotent guard).
  const adapter = getAdapter(runtimeKey);
  const installGuard =
    adapter?.installCommand && adapter?.binName
      ? `command -v ${adapter.binName} >/dev/null 2>&1 || { ${adapter.installCommand}; }`
      : null;
  // Inject the agent's OWN bound secrets (LLM API keys, etc.) so a real runtime can authenticate.
  const env = await resolveEnvForAgent(input.workspaceId, agent.id);
  const script = composeSandboxScript({
    prompt,
    repoUrl: bundle.project?.repoUrl,
    runtimeCmd,
    installGuard,
    env,
  });

  const ctx = {
    workspaceId: input.workspaceId,
    resolveSecret: (name: string) => resolveWorkspaceSecret(input.workspaceId, name),
  };

  // Persist the run ledger row up-front (status=running) so a crash mid-run leaves a trace.
  const run = await prisma.agentRun.create({
    data: {
      workspaceId: input.workspaceId,
      agentId: agent.id,
      taskId: input.taskId,
      kind: "sandbox",
      providerKey,
      requestedByProfileId: input.requestedByProfileId ?? null,
    },
  });

  let handle: Awaited<ReturnType<typeof provider.provision>> | undefined;
  try {
    handle = await provider.provision(ctx);
    let exitCode: number | null;
    let stdout: string;
    let stderr: string;
    try {
      const result = await handle.exec(script, {
        timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      });
      exitCode = result.exitCode;
      stdout = result.stdout.slice(-MAX_OUTPUT_CHARS);
      stderr = result.stderr.slice(-MAX_OUTPUT_CHARS);
    } finally {
      // Always tear the sandbox down, even on failure — never leak a running sandbox.
      await handle.destroy().catch(() => {});
    }

    const runStatus = exitCode === 0 ? "done" : exitCode === null ? "timeout" : "failed";
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        sandboxId: handle.id,
        status: runStatus,
        exitCode,
        stdout,
        stderr,
        finishedAt: new Date(),
      },
    });

    return {
      runId: run.id,
      providerKey,
      sandboxId: handle.id,
      exitCode,
      stdout,
      stderr,
      status: exitCode === 0 ? "review" : "blocked",
    };
  } catch (err) {
    // Provision/exec threw before we could record a result — mark the run failed, then re-throw.
    await prisma.agentRun
      .update({
        where: { id: run.id },
        data: {
          status: "failed",
          errorMessage: err instanceof Error ? err.message : String(err),
          finishedAt: new Date(),
          ...(handle ? { sandboxId: handle.id } : {}),
        },
      })
      .catch(() => {});
    throw err;
  }
}
