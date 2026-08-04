"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { TERMINAL_STATE } from "@agentcenter/utils";
import { TERMINAL_SESSIONS_QUERY } from "@/lib/graphql/queries";
import { CLOSE_TERMINAL_SESSION } from "@/lib/graphql/mutations";
import { Button, Card, Badge, EmptyState, Spinner } from "@/components/ui";
import { TerminalSessionDialog } from "@/components/dialogs/TerminalSessionDialog";
import { SquareTerminal } from "lucide-react";
import { TerminalConsole } from "@/components/terminals/TerminalConsole";

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
  const [{ data, fetching }, refetch] = useQuery<{ terminalSessions: Session[] }>({
    query: TERMINAL_SESSIONS_QUERY,
  });
  const [, close] = useMutation(CLOSE_TERMINAL_SESSION);

  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState<{
    id: string;
    host: string | null;
    token: string;
  } | null>(null);
  const [console_, setConsole] = useState<{ id: string; token: string } | null>(null);
  const sessions = data?.terminalSessions ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

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
    <div className="mx-auto space-y-6 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Terminals</h1>
          <p className="text-sm text-muted-foreground">
            Authorize an SSH session into an agent environment. A one-time connect token is minted;
            click Connect to open a live browser shell to a managed VM target.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>Open session</Button>
      </div>

      <TerminalSessionDialog open={open} onOpenChange={setOpen} onOpened={setRevealed} />

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
            <Button
              size="sm"
              onClick={() => setConsole({ id: revealed.id, token: revealed.token })}
            >
              Connect
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setRevealed(null)}>
              Dismiss
            </Button>
          </div>
        </Card>
      )}

      {console_ && (
        <TerminalConsole
          sessionId={console_.id}
          connectToken={console_.token}
          onClose={() => {
            setConsole(null);
            refresh();
          }}
        />
      )}

      {fetching && sessions.length === 0 && (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      )}
      {sessions.length === 0 && !fetching && (
        <EmptyState
          icon={<SquareTerminal className="h-8 w-8" />}
          title="No terminal sessions"
          description="Open a session to authorize an SSH connection into an agent environment."
        />
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
