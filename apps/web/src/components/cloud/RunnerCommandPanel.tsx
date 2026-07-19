"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { RUNNER_COMMANDS_QUERY } from "@/lib/graphql/queries";
import { RUN_COMMAND_ON_VM, CANCEL_RUNNER_COMMAND } from "@/lib/graphql/mutations";
import { Button, Card, Badge } from "@/components/ui";
import { Terminal } from "lucide-react";

// Tier D: run a raw shell/CLI command on a cloud VM via server-side SSH — NO agent runtime needed.
// RUNNERS-gated at the page level. Admin-only (the mutation enforces admin server-side).

interface RunnerCommand {
  id: string;
  targetKind: string;
  targetId: string;
  command: string;
  cwd: string | null;
  status: string;
  exitCode: number | null;
  stdout: string | null;
  stderr: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

const STATUS_VARIANT: Record<string, "green" | "red" | "gray" | "yellow"> = {
  done: "green",
  failed: "red",
  timeout: "red",
  canceled: "gray",
  running: "yellow",
  queued: "yellow",
};

export function RunnerCommandPanel({ vmId }: { vmId: string }) {
  const [{ data, fetching }, refetch] = useQuery<{ runnerCommands: RunnerCommand[] }>({
    query: RUNNER_COMMANDS_QUERY,
    variables: { targetKind: "cloud_vm", targetId: vmId, limit: 20 },
  });
  const [, runCommand] = useMutation(RUN_COMMAND_ON_VM);
  const [, cancelCommand] = useMutation(CANCEL_RUNNER_COMMAND);

  const [command, setCommand] = useState("");
  const [cwd, setCwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const commands = data?.runnerCommands ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function onRun() {
    setError(null);
    if (!command.trim()) return setError("Command is required");
    setBusy(true);
    try {
      const res = await runCommand({
        vmId,
        command: command.trim(),
        cwd: cwd.trim() || undefined,
      });
      if (res.error) return setError(res.error.graphQLErrors[0]?.message ?? "Failed to run");
      setCommand("");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Terminal className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Run command</h2>
        <span className="text-xs text-muted-foreground">
          Raw shell over SSH — no agent runtime required
        </span>
      </div>

      <Card className="space-y-2 p-4">
        <textarea
          className="w-full rounded border border-border bg-background px-3 py-2 font-mono text-sm"
          rows={2}
          placeholder="e.g. uname -a && df -h"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="min-w-[10rem] flex-1 rounded border border-border bg-background px-3 py-1.5 font-mono text-sm"
            placeholder="working dir (optional)"
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
          />
          <Button size="sm" loading={busy} disabled={busy} onClick={onRun}>
            Run
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">History</h3>
        <button
          onClick={refresh}
          className="text-xs text-muted-foreground transition hover:text-foreground"
        >
          Refresh
        </button>
      </div>

      {commands.length === 0 && !fetching && (
        <Card className="p-6 text-center text-sm text-muted-foreground">No commands yet.</Card>
      )}

      {commands.map((c) => (
        <Card key={c.id} className="p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              className="flex-1 truncate text-left font-mono text-sm text-foreground"
              onClick={() => setExpanded(expanded === c.id ? null : c.id)}
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
                    await cancelCommand({ id: c.id });
                    refresh();
                  }}
                >
                  Cancel
                </Button>
              )}
            </span>
          </div>
          {expanded === c.id && (
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
