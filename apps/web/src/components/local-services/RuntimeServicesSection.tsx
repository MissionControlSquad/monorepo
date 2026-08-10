"use client";

import { useState } from "react";
import { useMutation, useQuery } from "urql";
import { ServerCog, Boxes } from "lucide-react";
import { WORKSPACE_RUNTIME_SERVICES_QUERY } from "@/lib/graphql/queries";
import { STOP_WORKSPACE_RUNTIME_SERVICE } from "@/lib/graphql/mutations";
import { Button, Card, Badge, EmptyState, Tooltip, ConfirmDialog } from "@/components/ui";
import { RuntimeServiceDialog } from "@/components/dialogs/RuntimeServiceDialog";

// WorkspaceRuntimeService operator surface (long-lived dev/preview processes). LOCAL_SERVICES-gated,
// admin. The runner transitions status/health; this is the operator view + start/stop control.
interface RuntimeService {
  id: string;
  executionWorkspaceId: string;
  name: string;
  command: string;
  port: number | null;
  reuseKey: string;
  status: string;
  healthStatus: string | null;
  lastHealthAt: string | null;
  stopPolicy: string;
  pid: number | null;
}

const statusVariant = (s: string) =>
  s === "running"
    ? "green"
    : s === "unhealthy" || s === "stopped_failed"
      ? "red"
      : s === "starting"
        ? "yellow"
        : "gray";

const healthVariant = (h: string | null) =>
  h === "healthy" ? "green" : h === "unhealthy" ? "red" : "gray";

const STOP_POLICY_HELP: Record<string, string> = {
  on_run_end: "Stopped automatically when the run that started it ends.",
  on_idle: "Reaped automatically when the workspace goes idle past its TTL.",
  manual: "Only ever stopped by an explicit operator action.",
};

export function RuntimeServicesSection() {
  const [{ data, fetching, error }, refetch] = useQuery<{
    workspaceRuntimeServices: RuntimeService[];
  }>({ query: WORKSPACE_RUNTIME_SERVICES_QUERY });
  const [, stop] = useMutation(STOP_WORKSPACE_RUNTIME_SERVICE);
  const [open, setOpen] = useState(false);
  const [stopping, setStopping] = useState<RuntimeService | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = data?.workspaceRuntimeServices ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  const confirmStop = async () => {
    if (!stopping) return;
    setBusy(true);
    try {
      await stop({ id: stopping.id, reason: "manual" });
      setStopping(null);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const isLive = (s: string) => s === "running" || s === "starting" || s === "unhealthy";

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Runtime services</h2>
          <p className="text-sm text-muted-foreground">
            Long-lived dev/preview processes in an execution workspace (e.g.{" "}
            <code>npm run dev</code>), reused across runs and health-checked.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>Start service</Button>
      </div>

      <RuntimeServiceDialog open={open} onOpenChange={setOpen} onSaved={refresh} />

      {error ? (
        <Card padding="sm">
          <p className="text-sm text-destructive">
            Couldn’t load runtime services: {error.message}
          </p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={refresh}>
            Retry
          </Button>
        </Card>
      ) : rows.length === 0 && !fetching ? (
        <EmptyState
          icon={<Boxes className="h-8 w-8" />}
          title="No runtime services"
          description="Start a dev server or preview process to keep it alive across runs."
          action={<Button onClick={() => setOpen(true)}>Start service</Button>}
        />
      ) : rows.length === 0 && fetching ? (
        <Card padding="sm">
          <p className="text-sm text-muted-foreground">Loading runtime services…</p>
        </Card>
      ) : (
        <Card padding="none">
          <ul className="divide-y divide-border">
            {rows.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{s.name}</p>
                    <Tooltip
                      content={`Reuse key "${s.reuseKey}": starting again with this key re-attaches to this service instead of spawning a duplicate.`}
                    >
                      <Badge variant="gray" className="cursor-help font-mono text-[10px]">
                        {s.reuseKey}
                      </Badge>
                    </Tooltip>
                    <Tooltip content={STOP_POLICY_HELP[s.stopPolicy] ?? s.stopPolicy}>
                      <Badge variant="blue" className="cursor-help text-[10px]">
                        {s.stopPolicy}
                      </Badge>
                    </Tooltip>
                  </div>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {s.command}
                    {s.port ? ` · :${s.port}` : ""}
                    {s.pid ? ` · pid ${s.pid}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Tooltip
                    content={
                      s.lastHealthAt
                        ? `Health ${s.healthStatus ?? "unknown"} · last checked ${new Date(s.lastHealthAt).toLocaleString()}`
                        : "No health probe reported yet."
                    }
                  >
                    <Badge variant={healthVariant(s.healthStatus)} className="cursor-help">
                      {s.healthStatus ?? "unknown"}
                    </Badge>
                  </Tooltip>
                  <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
                  {isLive(s.status) && (
                    <Button variant="ghost" size="sm" onClick={() => setStopping(s)}>
                      Stop
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ConfirmDialog
        isOpen={!!stopping}
        onClose={() => setStopping(null)}
        onConfirm={confirmStop}
        loading={busy}
        title="Stop runtime service?"
        confirmLabel="Stop service"
        description="This is a manual stop — it overrides the stop policy and terminates the process now."
      >
        {stopping && (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
            <p className="font-medium text-foreground">{stopping.name}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {stopping.command}
              {stopping.port ? ` · :${stopping.port}` : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Reuse key <span className="font-mono">{stopping.reuseKey}</span> · policy{" "}
              <span className="font-mono">{stopping.stopPolicy}</span>
            </p>
          </div>
        )}
      </ConfirmDialog>
    </section>
  );
}

/** Icon used by the page header for the runtime-services surface. */
export const RuntimeServicesIcon = ServerCog;
