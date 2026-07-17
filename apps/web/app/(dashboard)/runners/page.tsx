"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import {
  RUNNER_HOSTS_QUERY,
  RUNNER_COMMANDS_QUERY,
  AGENTS_FOR_TASK_QUERY,
  RUNTIME_ADAPTERS_QUERY,
  SANDBOX_PROVIDERS_QUERY,
  AGENT_RUNS_QUERY,
} from "@/lib/graphql/queries";
import {
  CREATE_RUNNER_HOST,
  DELETE_RUNNER_HOST,
  RUN_COMMAND_ON_HOST,
  QUEUE_AGENT_COMMAND,
  CANCEL_RUNNER_COMMAND,
  SET_AGENT_RUNTIME,
  SET_AGENT_SANDBOX_PROVIDER,
  RUN_TASK_IN_SANDBOX,
} from "@/lib/graphql/mutations";
import { Button, Card, Badge } from "@/components/ui";
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
  startedAt: string;
  finishedAt: string | null;
}

const RUN_STATUS_VARIANT: Record<string, "green" | "red" | "gray" | "yellow"> = {
  done: "green",
  failed: "red",
  timeout: "red",
  canceled: "gray",
  running: "yellow",
};

function RunHistory() {
  const [{ data }, refetch] = useQuery<{ agentRuns: AgentRun[] }>({
    query: AGENT_RUNS_QUERY,
    variables: { limit: 20 },
  });
  const [open, setOpen] = useState<string | null>(null);
  const runs = data?.agentRuns ?? [];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">Run history</h3>
        <button
          onClick={() => refetch({ requestPolicy: "network-only" })}
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
            </span>
          </div>
          {open === r.id && (
            <div className="mt-2 space-y-2">
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
  const [{ data: hostData }, refetchHosts] = useQuery<{ runnerHosts: Host[] }>({
    query: RUNNER_HOSTS_QUERY,
  });
  const [{ data: agentData }] = useQuery<{ agents: AgentLite[] }>({ query: AGENTS_FOR_TASK_QUERY });
  const [{ data: adapterData }] = useQuery<{ runtimeAdapters: RuntimeAdapter[] }>({
    query: RUNTIME_ADAPTERS_QUERY,
  });
  const [{ data: sbxData }] = useQuery<{ sandboxProviders: SandboxProvider[] }>({
    query: SANDBOX_PROVIDERS_QUERY,
  });
  const [, createHost] = useMutation(CREATE_RUNNER_HOST);
  const [, deleteHost] = useMutation(DELETE_RUNNER_HOST);
  const [, runOnHost] = useMutation(RUN_COMMAND_ON_HOST);
  const [, queueAgent] = useMutation(QUEUE_AGENT_COMMAND);
  const [, setAgentRuntime] = useMutation(SET_AGENT_RUNTIME);
  const [, setAgentSandbox] = useMutation(SET_AGENT_SANDBOX_PROVIDER);
  const [, runInSandbox] = useMutation(RUN_TASK_IN_SANDBOX);

  const hosts = hostData?.runnerHosts ?? [];
  const agents = agentData?.agents ?? [];
  const adapters = adapterData?.runtimeAdapters ?? [];
  const sandboxProviders = sbxData?.sandboxProviders ?? [];

  const [form, setForm] = useState({ name: "", host: "", port: "22", username: "root", key: "" });
  const [hostCmd, setHostCmd] = useState<Record<string, string>>({});
  const [agentId, setAgentId] = useState("");
  const [agentCmd, setAgentCmd] = useState("");
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

  async function onCreateHost() {
    setError(null);
    if (!form.name.trim() || !form.host.trim() || !form.key.trim())
      return setError("name, host and private key are required");
    setBusy("host");
    try {
      const res = await createHost({
        name: form.name.trim(),
        host: form.host.trim(),
        port: Number(form.port) || 22,
        username: form.username.trim() || "root",
        privateKey: form.key,
      });
      if (res.error) return setError(res.error.graphQLErrors[0]?.message ?? "Failed to add host");
      setForm({ name: "", host: "", port: "22", username: "root", key: "" });
      refetchHosts({ requestPolicy: "network-only" });
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

  async function onQueueAgent() {
    setError(null);
    if (!agentId) return setError("Pick an agent");
    if (!agentCmd.trim()) return setError("Command is required");
    setBusy("agent");
    try {
      const res = await queueAgent({ agentId, command: agentCmd.trim() });
      if (res.error) return setError(res.error.graphQLErrors[0]?.message ?? "Queue failed");
      setAgentCmd("");
      setHistoryKey((k) => k + 1);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 sm:p-6">
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
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">BYO servers (direct SSH)</h2>
        </div>

        <Card className="grid gap-2 p-4 sm:grid-cols-2">
          <input
            className="rounded border border-border bg-background px-3 py-1.5 text-sm"
            placeholder="name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            className="rounded border border-border bg-background px-3 py-1.5 font-mono text-sm"
            placeholder="host or IP"
            value={form.host}
            onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
          />
          <input
            className="rounded border border-border bg-background px-3 py-1.5 text-sm"
            placeholder="port"
            value={form.port}
            onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
          />
          <input
            className="rounded border border-border bg-background px-3 py-1.5 text-sm"
            placeholder="username"
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
          />
          <textarea
            className="rounded border border-border bg-background px-3 py-2 font-mono text-xs sm:col-span-2"
            rows={3}
            placeholder="SSH private key (PEM) — stored encrypted, never shown again"
            value={form.key}
            onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
          />
          <div className="sm:col-span-2">
            <Button
              size="sm"
              loading={busy === "host"}
              disabled={busy === "host"}
              onClick={onCreateHost}
            >
              Add host
            </Button>
          </div>
        </Card>

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
        {hosts.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No hosts registered.
          </Card>
        )}
        <CommandHistory key={`host-${historyKey}`} targetKind="host" />
      </section>

      {/* ── Agent runners ─────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Agent runners (daemon pull)</h2>
        </div>
        <p className="-mt-1 text-xs text-muted-foreground">
          Queue a command an agent&apos;s <code>@agentcenter/runner</code> daemon pulls on its next
          poll. Works behind NAT — the machine only makes outbound connections.
        </p>
        <Card className="flex flex-wrap items-end gap-2 p-4">
          <select
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
          >
            <option value="">Select agent…</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.identityEmoji ? `${a.identityEmoji} ` : ""}
                {a.name}
              </option>
            ))}
          </select>
          <input
            className="min-w-[10rem] flex-1 rounded border border-border bg-background px-3 py-1.5 font-mono text-sm"
            placeholder="command to queue"
            value={agentCmd}
            onChange={(e) => setAgentCmd(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onQueueAgent()}
          />
          <Button
            size="sm"
            loading={busy === "agent"}
            disabled={busy === "agent"}
            onClick={onQueueAgent}
          >
            Queue
          </Button>
        </Card>

        {/* Per-agent runtime: which adapter + model the runner uses for the selected agent. */}
        <Card className="space-y-2 p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Runtime for the selected agent (overrides the runner default)
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <select
              className="rounded border border-border bg-background px-2 py-1.5 text-sm"
              value={rt.adapter}
              onChange={(e) => setRt((r) => ({ ...r, adapter: e.target.value }))}
            >
              <option value="">runner default</option>
              {adapters.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.displayName}
                </option>
              ))}
            </select>
            {selectedAdapter?.supportsModel &&
              (selectedAdapter.models.length > 0 ? (
                <select
                  className="rounded border border-border bg-background px-2 py-1.5 text-sm"
                  value={rt.model}
                  onChange={(e) => setRt((r) => ({ ...r, model: e.target.value }))}
                >
                  <option value="">default model</option>
                  {selectedAdapter.models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
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
          <p className="text-xs font-medium text-muted-foreground">
            Sandbox for the selected agent (uses the agent picker above)
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <select
              className="rounded border border-border bg-background px-2 py-1.5 text-sm"
              value={sbx.provider}
              onChange={(e) => setSbx((s) => ({ ...s, provider: e.target.value }))}
            >
              <option value="">none (run on runner)</option>
              {sandboxProviders.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.displayName}
                </option>
              ))}
            </select>
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
