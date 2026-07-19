"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import {
  RUNNER_HOSTS_QUERY,
  RUNNER_COMMANDS_QUERY,
  AGENTS_FOR_TASK_QUERY,
} from "@/lib/graphql/queries";
import {
  CREATE_RUNNER_HOST,
  DELETE_RUNNER_HOST,
  RUN_COMMAND_ON_HOST,
  QUEUE_AGENT_COMMAND,
  CANCEL_RUNNER_COMMAND,
} from "@/lib/graphql/mutations";
import { Button, Card, Badge } from "@/components/ui";
import { Server, Bot } from "lucide-react";

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
  const [, createHost] = useMutation(CREATE_RUNNER_HOST);
  const [, deleteHost] = useMutation(DELETE_RUNNER_HOST);
  const [, runOnHost] = useMutation(RUN_COMMAND_ON_HOST);
  const [, queueAgent] = useMutation(QUEUE_AGENT_COMMAND);

  const hosts = hostData?.runnerHosts ?? [];
  const agents = agentData?.agents ?? [];

  const [form, setForm] = useState({ name: "", host: "", port: "22", username: "root", key: "" });
  const [hostCmd, setHostCmd] = useState<Record<string, string>>({});
  const [agentId, setAgentId] = useState("");
  const [agentCmd, setAgentCmd] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0); // bump to remount history after a run

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
        <CommandHistory key={`agent-${historyKey}`} targetKind="agent" />
      </section>
    </div>
  );
}
