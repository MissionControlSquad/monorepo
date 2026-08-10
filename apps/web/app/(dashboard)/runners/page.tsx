"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "urql";
import { toast } from "sonner";
import {
  RUNNER_HOSTS_QUERY,
  RUNNER_COMMANDS_QUERY,
  AGENTS_FOR_TASK_QUERY,
  RUNTIME_ADAPTERS_QUERY,
  SANDBOX_PROVIDERS_QUERY,
  AGENT_RUNS_QUERY,
  AGENT_RUN_LIVE_STATUS_QUERY,
} from "@/lib/graphql/queries";
import {
  DELETE_RUNNER_HOST,
  RUN_COMMAND_ON_HOST,
  CANCEL_RUNNER_COMMAND,
  SET_AGENT_RUNTIME,
  SET_AGENT_SANDBOX_PROVIDER,
  RUN_TASK_IN_SANDBOX,
  ENQUEUE_TASK_IN_SANDBOX,
  CANCEL_AGENT_RUN,
  PROMOTE_AGENT_RUN_REVIEW,
} from "@/lib/graphql/mutations";
import { Button, Card, Badge, Spinner, Select } from "@/components/ui";
import { RunnerHostDialog } from "@/components/dialogs/RunnerHostDialog";
import { RunnerQueueCommandDialog } from "@/components/dialogs/RunnerQueueCommandDialog";
import { Server, Bot, Box } from "lucide-react";

// Tier D: Runners dashboard. BYO hosts (register a server + run raw commands over direct SSH — the
// "host" target) and Agent runners (queue a command an outbound daemon pulls — the "agent" target).
// RUNNERS-gated in nav; every mutation re-checks the flag + admin server-side.

interface Host {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
}
interface Cmd {
  id: string;
  targetKind: string;
  targetId: string;
  command: string;
  status: string;
  exitCode: number | null;
  stdout: string | null;
  stderr: string | null;
  errorMessage: string | null;
  createdAt: string;
}
interface AgentLite {
  id: string;
  name: string;
  identityEmoji: string | null;
}
interface RuntimeAdapter {
  key: string;
  displayName: string;
  requiresTemplate: boolean;
  supportsModel: boolean;
  models: string[];
}
interface SandboxProvider {
  key: string;
  displayName: string;
  requiresApiKey: boolean;
  credentialKeys: string[];
  isolating: boolean;
  configured: boolean;
  available: boolean;
}
interface AgentRun {
  id: string;
  agentId: string | null;
  taskId: string | null;
  kind: string;
  providerKey: string | null;
  status: string;
  exitCode: number | null;
  stdout: string | null;
  stderr: string | null;
  errorMessage: string | null;
  usageTokensIn: number | null;
  usageTokensOut: number | null;
  usageModel: string | null;
  errorFamily: string | null;
  exitReason: string | null;
  reviewState: string | null;
  startedAt: string;
  finishedAt: string | null;
}

const RUN_STATUS_VARIANT: Record<string, "green" | "red" | "gray" | "yellow"> = {
  done: "green",
  failed: "red",
  timeout: "red",
  canceled: "gray",
  running: "yellow",
  queued: "yellow",
};

// Plan 6: the redacted live tail of an in-flight run, polled every 2s while open.
function LiveTail({ runId }: { runId: string }) {
  const [{ data }, refetch] = useQuery<{
    agentRunLiveStatus: { phase: string; tail: string } | null;
  }>({ query: AGENT_RUN_LIVE_STATUS_QUERY, variables: { runId } });
  useEffect(() => {
    const t = setInterval(() => refetch({ requestPolicy: "network-only" }), 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);
  const status = data?.agentRunLiveStatus;
  if (!status) return <p className="text-xs text-muted-foreground">Waiting for output…</p>;
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">● live · {status.phase}</p>
      {status.tail && (
        <pre className="max-h-48 overflow-auto rounded bg-foreground/90 p-2 text-xs text-background">
          {status.tail}
        </pre>
      )}
    </div>
  );
}

function RunHistory() {
  const [{ data }, refetch] = useQuery<{ agentRuns: AgentRun[] }>({
    query: AGENT_RUNS_QUERY,
    variables: { limit: 20 },
  });
  const [, cancelRun] = useMutation(CANCEL_AGENT_RUN);
  const [, promoteRun] = useMutation(PROMOTE_AGENT_RUN_REVIEW);
  const [open, setOpen] = useState<string | null>(null);
  const [busyCancel, setBusyCancel] = useState<string | null>(null);
  const [busyReview, setBusyReview] = useState<string | null>(null);
  const runs = data?.agentRuns ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  // Domain 7 (low-trust review): a run quarantined in needs_review is promoted (or sent back) by an
  // admin — the only path out. Approving flips its source-trust disposition to trusted.
  async function onReview(runId: string, decision: "approved" | "changes_requested") {
    setBusyReview(runId);
    try {
      const res = await promoteRun({ runId, decision });
      if (res.error) toast.error(res.error.graphQLErrors[0]?.message ?? "Failed to review run");
      else {
        toast.success(decision === "approved" ? "Run approved" : "Changes requested");
        refresh();
      }
    } finally {
      setBusyReview(null);
    }
  }

  // Poll while anything is in flight so queued → running → terminal transitions surface live
  // (the in-process drain loop / cron advance the rows server-side).
  const hasInFlight = runs.some((r) => r.status === "queued" || r.status === "running");
  useEffect(() => {
    if (!hasInFlight) return;
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasInFlight]);

  async function onCancel(runId: string) {
    setBusyCancel(runId);
    try {
      await cancelRun({ runId });
      refresh();
    } finally {
      setBusyCancel(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">Run history</h3>
        <button
          onClick={refresh}
          className="text-xs text-muted-foreground transition hover:text-foreground"
        >
          Refresh
        </button>
      </div>
      {runs.length === 0 && <p className="text-sm text-muted-foreground">No runs yet.</p>}
      {runs.map((r) => (
        <Card key={r.id} className="p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              className="flex-1 truncate text-left font-mono text-xs text-foreground"
              onClick={() => setOpen(open === r.id ? null : r.id)}
            >
              {r.kind}
              {r.providerKey ? `:${r.providerKey}` : ""} ·{" "}
              {r.startedAt.slice(0, 19).replace("T", " ")}
            </button>
            <span className="flex items-center gap-2">
              {r.exitCode != null && (
                <span className="text-xs text-muted-foreground">exit {r.exitCode}</span>
              )}
              <Badge variant={RUN_STATUS_VARIANT[r.status] ?? "gray"}>{r.status}</Badge>
              {r.reviewState === "needs_review" && <Badge variant="yellow">needs review</Badge>}
              {r.reviewState === "approved" && <Badge variant="green">approved</Badge>}
              {r.reviewState === "changes_requested" && (
                <Badge variant="orange">changes requested</Badge>
              )}
              {(r.status === "queued" || r.status === "running") && (
                <button
                  onClick={() => onCancel(r.id)}
                  disabled={busyCancel === r.id}
                  title={
                    r.status === "running"
                      ? "Terminates the running task and marks it cancelled"
                      : "Cancels the queued run before a worker picks it up"
                  }
                  className="text-xs text-destructive transition hover:underline disabled:opacity-50"
                >
                  {r.status === "running" ? "Cancel run" : "Cancel"}
                </button>
              )}
              {r.reviewState === "needs_review" && (
                <>
                  <button
                    onClick={() => onReview(r.id, "approved")}
                    disabled={busyReview === r.id}
                    className="text-xs text-green-600 transition hover:underline disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => onReview(r.id, "changes_requested")}
                    disabled={busyReview === r.id}
                    className="text-xs text-muted-foreground transition hover:underline disabled:opacity-50"
                  >
                    Request changes
                  </button>
                </>
              )}
            </span>
          </div>
          {open === r.id && (
            <div className="mt-2 space-y-2">
              {(r.status === "running" || r.status === "queued") && <LiveTail runId={r.id} />}
              {/* Structured adapter execution result (usage/model + machine-readable outcome). */}
              {(r.exitReason ||
                r.errorFamily ||
                r.usageModel ||
                r.usageTokensIn != null ||
                r.usageTokensOut != null) && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {r.exitReason && <Badge variant="gray">{r.exitReason}</Badge>}
                  {r.errorFamily && <Badge variant="orange">{r.errorFamily}</Badge>}
                  {r.usageModel && <span className="font-mono">{r.usageModel}</span>}
                  {(r.usageTokensIn != null || r.usageTokensOut != null) && (
                    <span>
                      tokens {r.usageTokensIn ?? 0} in / {r.usageTokensOut ?? 0} out
                    </span>
                  )}
                </div>
              )}
              {r.stdout && (
                <pre className="max-h-48 overflow-auto rounded bg-foreground/90 p-2 text-xs text-background">
                  {r.stdout}
                </pre>
              )}
              {r.stderr && (
                <pre className="max-h-32 overflow-auto rounded bg-destructive/10 p-2 text-xs text-destructive">
                  {r.stderr}
                </pre>
              )}
              {r.errorMessage && <p className="text-xs text-destructive">{r.errorMessage}</p>}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

const STATUS_VARIANT: Record<string, "green" | "red" | "gray" | "yellow"> = {
  done: "green",
  failed: "red",
  timeout: "red",
  canceled: "gray",
  running: "yellow",
  queued: "yellow",
};

function CommandHistory({ targetKind }: { targetKind: string }) {
  const [{ data }, refetch] = useQuery<{ runnerCommands: Cmd[] }>({
    query: RUNNER_COMMANDS_QUERY,
    variables: { targetKind, limit: 20 },
  });
  const [, cancel] = useMutation(CANCEL_RUNNER_COMMAND);
  const [open, setOpen] = useState<string | null>(null);
  const cmds = data?.runnerCommands ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">History</h3>
        <button
          onClick={refresh}
          className="text-xs text-muted-foreground transition hover:text-foreground"
        >
          Refresh
        </button>
      </div>
      {cmds.length === 0 && <p className="text-sm text-muted-foreground">No commands yet.</p>}
      {cmds.map((c) => (
        <Card key={c.id} className="p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              className="flex-1 truncate text-left font-mono text-sm text-foreground"
              onClick={() => setOpen(open === c.id ? null : c.id)}
              title={c.command}
            >
              {c.command}
            </button>
            <span className="flex items-center gap-2">
              {c.exitCode != null && (
                <span className="text-xs text-muted-foreground">exit {c.exitCode}</span>
              )}
              <Badge variant={STATUS_VARIANT[c.status] ?? "gray"}>{c.status}</Badge>
              {(c.status === "queued" || c.status === "running") && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await cancel({ id: c.id });
                    refresh();
                  }}
                >
                  Cancel
                </Button>
              )}
            </span>
          </div>
          {open === c.id && (
            <div className="mt-2 space-y-2">
              {c.stdout && (
                <pre className="max-h-48 overflow-auto rounded bg-foreground/90 p-2 text-xs text-background">
                  {c.stdout}
                </pre>
              )}
              {c.stderr && (
                <pre className="max-h-32 overflow-auto rounded bg-destructive/10 p-2 text-xs text-destructive">
                  {c.stderr}
                </pre>
              )}
              {c.errorMessage && <p className="text-xs text-destructive">{c.errorMessage}</p>}
              {!c.stdout && !c.stderr && !c.errorMessage && (
                <p className="text-xs text-muted-foreground">No output.</p>
              )}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

export default function RunnersPage() {
  const [{ data: hostData, fetching: hostsFetching }, refetchHosts] = useQuery<{
    runnerHosts: Host[];
  }>({
    query: RUNNER_HOSTS_QUERY,
  });
  const [{ data: agentData }] = useQuery<{ agents: AgentLite[] }>({ query: AGENTS_FOR_TASK_QUERY });
  const [{ data: adapterData }] = useQuery<{ runtimeAdapters: RuntimeAdapter[] }>({
    query: RUNTIME_ADAPTERS_QUERY,
  });
  const [{ data: sbxData }] = useQuery<{ sandboxProviders: SandboxProvider[] }>({
    query: SANDBOX_PROVIDERS_QUERY,
  });
  const [, deleteHost] = useMutation(DELETE_RUNNER_HOST);
  const [, runOnHost] = useMutation(RUN_COMMAND_ON_HOST);
  const [, setAgentRuntime] = useMutation(SET_AGENT_RUNTIME);
  const [, setAgentSandbox] = useMutation(SET_AGENT_SANDBOX_PROVIDER);
  const [, runInSandbox] = useMutation(RUN_TASK_IN_SANDBOX);
  const [, enqueueInSandbox] = useMutation(ENQUEUE_TASK_IN_SANDBOX);

  const hosts = hostData?.runnerHosts ?? [];
  const agents = agentData?.agents ?? [];
  const adapters = adapterData?.runtimeAdapters ?? [];
  const sandboxProviders = sbxData?.sandboxProviders ?? [];

  const [hostOpen, setHostOpen] = useState(false);
  const [hostCmd, setHostCmd] = useState<Record<string, string>>({});
  const [agentId, setAgentId] = useState("");
  const [queueOpen, setQueueOpen] = useState(false);
  const [rt, setRt] = useState({ adapter: "", model: "", template: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0); // bump to remount history after a run
  const [sbx, setSbx] = useState({ provider: "", taskId: "" });
  const [sbxResult, setSbxResult] = useState<{
    providerKey: string;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    status: string;
  } | null>(null);

  const selectedAdapter = adapters.find((a) => a.key === rt.adapter);

  async function onSaveSandbox() {
    setError(null);
    if (!agentId) return setError("Pick an agent first");
    setBusy("sandbox-save");
    try {
      const res = await setAgentSandbox({ agentId, provider: sbx.provider || null });
      if (res.error) setError(res.error.graphQLErrors[0]?.message ?? "Failed to set sandbox");
    } finally {
      setBusy(null);
    }
  }

  async function onRunSandbox() {
    setError(null);
    setSbxResult(null);
    if (!agentId) return setError("Pick an agent");
    if (!sbx.taskId.trim()) return setError("Task id is required");
    setBusy("sandbox-run");
    try {
      const res = await runInSandbox({
        taskId: sbx.taskId.trim(),
        agentId,
        provider: sbx.provider || null,
      });
      if (res.error) return setError(res.error.graphQLErrors[0]?.message ?? "Run failed");
      setSbxResult(res.data.runTaskInSandbox);
      setHistoryKey((k) => k + 1); // refresh run history
    } finally {
      setBusy(null);
    }
  }

  async function onEnqueueSandbox() {
    setError(null);
    setSbxResult(null);
    if (!agentId) return setError("Pick an agent");
    if (!sbx.taskId.trim()) return setError("Task id is required");
    setBusy("sandbox-enqueue");
    try {
      const res = await enqueueInSandbox({
        taskId: sbx.taskId.trim(),
        agentId,
        provider: sbx.provider || null,
      });
      if (res.error) return setError(res.error.graphQLErrors[0]?.message ?? "Enqueue failed");
      setHistoryKey((k) => k + 1); // surface the new queued run below
    } finally {
      setBusy(null);
    }
  }

  async function onSaveRuntime() {
    setError(null);
    if (!agentId) return setError("Pick an agent first");
    setBusy("runtime");
    try {
      const res = await setAgentRuntime({
        agentId,
        adapter: rt.adapter || null,
        model: rt.model.trim() || null,
        template: rt.template.trim() || null,
      });
      if (res.error) setError(res.error.graphQLErrors[0]?.message ?? "Failed to set runtime");
    } finally {
      setBusy(null);
    }
  }

  async function onRunHost(id: string) {
    const command = (hostCmd[id] ?? "").trim();
    if (!command) return;
    setBusy(id);
    try {
      const res = await runOnHost({ hostId: id, command });
      if (res.error) setError(res.error.graphQLErrors[0]?.message ?? "Run failed");
      setHostCmd((m) => ({ ...m, [id]: "" }));
      setHistoryKey((k) => k + 1);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto space-y-8 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Runners</h1>
        <p className="text-sm text-muted-foreground">
          Run raw commands on your own servers over SSH, or queue commands an outbound runner daemon
          pulls — no agent runtime required. Your code and credentials stay on your machine.
        </p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* ── BYO Hosts ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">BYO servers (direct SSH)</h2>
          </div>
          <Button size="sm" onClick={() => setHostOpen(true)}>
            Add host
          </Button>
        </div>

        <RunnerHostDialog
          open={hostOpen}
          onOpenChange={setHostOpen}
          onSaved={() => refetchHosts({ requestPolicy: "network-only" })}
        />

        {hosts.map((h) => (
          <Card key={h.id} className="space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className="font-medium text-foreground">{h.name}</span>
                <code className="font-mono text-xs text-muted-foreground">
                  {h.username}@{h.host}
                  {h.port !== 22 ? `:${h.port}` : ""}
                </code>
              </span>
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  await deleteHost({ id: h.id });
                  refetchHosts({ requestPolicy: "network-only" });
                }}
              >
                Delete
              </Button>
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded border border-border bg-background px-3 py-1.5 font-mono text-sm"
                placeholder="command to run, e.g. uname -a"
                value={hostCmd[h.id] ?? ""}
                onChange={(e) => setHostCmd((m) => ({ ...m, [h.id]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && onRunHost(h.id)}
              />
              <Button
                size="sm"
                loading={busy === h.id}
                disabled={busy === h.id}
                onClick={() => onRunHost(h.id)}
              >
                Run
              </Button>
            </div>
          </Card>
        ))}
        {hostsFetching && hosts.length === 0 && (
          <div className="flex justify-center p-8">
            <Spinner />
          </div>
        )}
        {hosts.length === 0 && !hostsFetching && (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No hosts registered.
          </Card>
        )}
        <CommandHistory key={`host-${historyKey}`} targetKind="host" />
      </section>

      {/* ── Agent runners ─────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Agent runners (daemon pull)</h2>
          </div>
          <Button size="sm" onClick={() => setQueueOpen(true)}>
            Queue command
          </Button>
        </div>
        <p className="-mt-1 text-xs text-muted-foreground">
          Queue a command an agent&apos;s <code>@agentcenter/runner</code> daemon pulls on its next
          poll. Works behind NAT — the machine only makes outbound connections.
        </p>

        <RunnerQueueCommandDialog
          open={queueOpen}
          onOpenChange={setQueueOpen}
          agents={agents}
          agentId={agentId}
          onAgentChange={setAgentId}
          onSaved={() => setHistoryKey((k) => k + 1)}
        />

        {/* Per-agent runtime: which adapter + model the runner uses for the selected agent. */}
        <Card className="space-y-2 p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Runtime for the selected agent (overrides the runner default)
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <Select
              size="sm"
              value={rt.adapter}
              onChange={(e) => setRt((r) => ({ ...r, adapter: e.target.value }))}
            >
              <option value="">runner default</option>
              {adapters.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.displayName}
                </option>
              ))}
            </Select>
            {selectedAdapter?.supportsModel &&
              (selectedAdapter.models.length > 0 ? (
                <Select
                  size="sm"
                  value={rt.model}
                  onChange={(e) => setRt((r) => ({ ...r, model: e.target.value }))}
                >
                  <option value="">default model</option>
                  {selectedAdapter.models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              ) : (
                <input
                  className="rounded border border-border bg-background px-3 py-1.5 text-sm"
                  placeholder="model (optional)"
                  value={rt.model}
                  onChange={(e) => setRt((r) => ({ ...r, model: e.target.value }))}
                />
              ))}
            {selectedAdapter?.requiresTemplate && (
              <input
                className="min-w-[12rem] flex-1 rounded border border-border bg-background px-3 py-1.5 font-mono text-sm"
                placeholder="command / argv / URL template"
                value={rt.template}
                onChange={(e) => setRt((r) => ({ ...r, template: e.target.value }))}
              />
            )}
            <Button
              size="sm"
              variant="secondary"
              loading={busy === "runtime"}
              disabled={busy === "runtime" || !agentId}
              onClick={onSaveRuntime}
            >
              Save runtime
            </Button>
          </div>
        </Card>
        <CommandHistory key={`agent-${historyKey}`} targetKind="agent" />
      </section>

      {/* ── Sandboxes ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Box className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Sandboxes (ephemeral, BYO)</h2>
        </div>
        <p className="-mt-1 text-xs text-muted-foreground">
          Run an agent&apos;s tasks inside a throwaway cloud sandbox. Bring your own provider key —
          add it in{" "}
          <a href="/secrets" className="underline">
            Secrets
          </a>{" "}
          under the exact name shown, then pick the provider.
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          {sandboxProviders.map((p) => (
            <Card key={p.key} className="flex items-center justify-between gap-2 p-3">
              <span className="min-w-0 space-y-0.5">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium text-foreground">{p.displayName}</span>
                  <code className="text-xs text-muted-foreground">{p.key}</code>
                  {!p.isolating && (
                    <span className="text-xs text-yellow-600">on-host · not for low-trust</span>
                  )}
                </span>
                {p.credentialKeys.length > 0 && (
                  <p className="truncate text-xs text-muted-foreground">
                    secrets: {p.credentialKeys.join(", ")}
                  </p>
                )}
              </span>
              <Badge variant={p.configured ? "green" : p.requiresApiKey ? "yellow" : "gray"}>
                {p.requiresApiKey ? (p.configured ? "configured" : "add key") : "ready"}
              </Badge>
            </Card>
          ))}
        </div>

        <Card className="space-y-2 p-4">
          <p className="text-xs font-medium text-muted-foreground">Sandbox for a selected agent</p>
          <div className="flex flex-wrap items-end gap-2">
            <Select size="sm" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              <option value="">Select agent…</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.identityEmoji ? `${a.identityEmoji} ` : ""}
                  {a.name}
                </option>
              ))}
            </Select>
            <Select
              size="sm"
              value={sbx.provider}
              onChange={(e) => setSbx((s) => ({ ...s, provider: e.target.value }))}
            >
              <option value="">none (run on runner)</option>
              {sandboxProviders.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.displayName}
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              variant="secondary"
              loading={busy === "sandbox-save"}
              disabled={busy === "sandbox-save" || !agentId}
              onClick={onSaveSandbox}
            >
              Save sandbox
            </Button>
            <input
              className="min-w-[10rem] flex-1 rounded border border-border bg-background px-3 py-1.5 font-mono text-sm"
              placeholder="task id to run in the sandbox"
              value={sbx.taskId}
              onChange={(e) => setSbx((s) => ({ ...s, taskId: e.target.value }))}
            />
            <Button
              size="sm"
              loading={busy === "sandbox-run"}
              disabled={busy === "sandbox-run" || !agentId}
              onClick={onRunSandbox}
            >
              Run in sandbox
            </Button>
            <Button
              size="sm"
              variant="secondary"
              loading={busy === "sandbox-enqueue"}
              disabled={busy === "sandbox-enqueue" || !agentId}
              onClick={onEnqueueSandbox}
              title="Queue a background run — a worker executes it; watch it in Run history below"
            >
              Enqueue
            </Button>
          </div>
          {sbxResult && (
            <div className="space-y-1">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {sbxResult.providerKey} · exit {sbxResult.exitCode ?? "—"} ·
                <Badge variant={sbxResult.status === "review" ? "green" : "red"}>
                  {sbxResult.status}
                </Badge>
              </span>
              {sbxResult.stdout && (
                <pre className="max-h-48 overflow-auto rounded bg-foreground/90 p-2 text-xs text-background">
                  {sbxResult.stdout}
                </pre>
              )}
              {sbxResult.stderr && (
                <pre className="max-h-32 overflow-auto rounded bg-destructive/10 p-2 text-xs text-destructive">
                  {sbxResult.stderr}
                </pre>
              )}
            </div>
          )}
        </Card>

        <RunHistory key={`runs-${historyKey}`} />
      </section>
    </div>
  );
}
