"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { TERMINAL_STATE } from "@agentcenter/utils";
import { TERMINAL_SESSIONS_QUERY } from "@/lib/graphql/queries";
import { OPEN_TERMINAL_SESSION, CLOSE_TERMINAL_SESSION } from "@/lib/graphql/mutations";
import { Button, Card, Badge } from "@/components/ui";

// Epic #9: terminal sessions. TERMINALS-gated (experimental, admin). Authorize a session into an agent
// environment over SSH; a one-time connect token is minted. NOTE: v1 does not open a live shell — the
// session is authorized, not connected (the PTY/SSH stream is a deferred runtime slice).

interface Session {
  id: string;
  label: string | null;
  status: string;
  username: string | null;
  host: string | null;
  port: number | null;
  cwd: string | null;
  lastActivityAt: string | null;
  sessionExpiresAt: string;
  closedAt: string | null;
  createdAt: string;
}

function effectiveState(s: Session): string {
  if (s.closedAt || s.status === TERMINAL_STATE.CLOSED) return TERMINAL_STATE.CLOSED;
  if (new Date(s.sessionExpiresAt).getTime() <= Date.now()) return TERMINAL_STATE.EXPIRED;
  return s.status;
}
const STATE_VARIANT: Record<string, "gray" | "blue" | "green" | "yellow" | "red"> = {
  [TERMINAL_STATE.PENDING]: "yellow",
  [TERMINAL_STATE.ACTIVE]: "green",
  [TERMINAL_STATE.CLOSED]: "gray",
  [TERMINAL_STATE.EXPIRED]: "red",
};

export default function TerminalsPage() {
  const [{ data }, refetch] = useQuery<{ terminalSessions: Session[] }>({
    query: TERMINAL_SESSIONS_QUERY,
  });
  const [, open] = useMutation(OPEN_TERMINAL_SESSION);
  const [, close] = useMutation(CLOSE_TERMINAL_SESSION);

  const [command, setCommand] = useState("");
  const [cwd, setCwd] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ host: string | null; token: string } | null>(null);
  const sessions = data?.terminalSessions ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function onOpen() {
    setError(null);
    if (!command.trim()) return setError("An ssh command is required");
    setBusy("open");
    try {
      const res = await open({
        command: command.trim(),
        cwd: cwd.trim() || null,
        label: label.trim() || null,
      });
      if (res.error) return setError(res.error.graphQLErrors[0]?.message ?? "Open failed");
      const s = res.data.openTerminalSession;
      setRevealed({ host: s.host, token: s.connectToken });
      setCommand("");
      setCwd("");
      setLabel("");
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onClose(id: string) {
    setBusy(id);
    try {
      await close({ id });
      refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Terminals</h1>
        <p className="text-sm text-muted-foreground">
          Authorize an SSH session into an agent environment. A one-time connect token is minted —
          the live shell stream is not yet enabled on this instance.
        </p>
      </div>

      {revealed && (
        <Card className="space-y-2 border-success bg-success-muted p-4">
          <p className="text-sm font-medium text-foreground">
            Connect token{revealed.host ? ` for ${revealed.host}` : ""} — copy it now, it won&apos;t
            be shown again.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              className="w-full rounded border border-border bg-background px-3 py-1.5 font-mono text-xs"
              value={revealed.token}
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button size="sm" onClick={() => navigator.clipboard?.writeText(revealed.token)}>
              Copy
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setRevealed(null)}>
              Dismiss
            </Button>
          </div>
        </Card>
      )}

      <Card className="space-y-2 p-4">
        <input
          className="w-full rounded border border-border bg-background px-3 py-1.5 font-mono text-sm"
          placeholder="ssh user@host  |  ssh -p 2222 user@host"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <input
            className="flex-1 rounded border border-border bg-background px-3 py-1.5 text-sm"
            placeholder="cwd (optional)"
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
          />
          <input
            className="flex-1 rounded border border-border bg-background px-3 py-1.5 text-sm"
            placeholder="label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <Button size="sm" disabled={!command.trim() || busy === "open"} onClick={onOpen}>
            Open session
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>

      {sessions.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">No terminal sessions.</Card>
      )}

      {sessions.map((s) => {
        const state = effectiveState(s);
        return (
          <Card key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant={STATE_VARIANT[state] ?? "gray"}>{state}</Badge>
              <code className="font-mono text-sm text-foreground">
                {s.username}@{s.host}
                {s.port && s.port !== 22 ? `:${s.port}` : ""}
              </code>
              {s.label && <span className="text-xs text-muted-foreground">({s.label})</span>}
              <span className="text-xs text-muted-foreground">
                {s.lastActivityAt
                  ? `active ${new Date(s.lastActivityAt).toLocaleString()}`
                  : "not yet connected"}
              </span>
            </span>
            {state !== "closed" && state !== "expired" && (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy === s.id}
                onClick={() => onClose(s.id)}
              >
                Close
              </Button>
            )}
          </Card>
        );
      })}
    </div>
  );
}
