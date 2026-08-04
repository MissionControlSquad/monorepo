"use client";

import { useState } from "react";
import { useQuery } from "urql";
import { ServerCog } from "lucide-react";
import { LOCAL_SERVICES_QUERY } from "@/lib/graphql/queries";
import { Button, Card, Badge, EmptyState } from "@/components/ui";
import { LocalServiceDialog } from "@/components/dialogs/LocalServiceDialog";

// Local service supervision (parity #95). LOCAL_SERVICES-gated, admin. Registry + observed status of
// local_stdio services (e.g. MCP runtime slots). The supervisor (infra) transitions status; this is the
// operator view + registration.
interface LocalService {
  id: string; key: string; kind: string; status: string; pid: number | null;
  restartCount: number; lastError: string | null; lastHealthyAt: string | null;
}
const statusVariant = (s: string) =>
  s === "running" ? "green" : s === "crashed" || s === "suppressed" ? "red" : s === "starting" ? "yellow" : "gray";

export default function LocalServicesPage() {
  const [{ data, fetching }, refetch] = useQuery<{ localServices: LocalService[] }>({ query: LOCAL_SERVICES_QUERY });
  const [open, setOpen] = useState(false);
  const rows = data?.localServices ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  return (
    <div className="mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Local services</h1>
          <p className="text-sm text-muted-foreground">Supervised local_stdio services (e.g. MCP slots).</p>
        </div>
        <Button onClick={() => setOpen(true)}>Register service</Button>
      </div>

      <LocalServiceDialog open={open} onOpenChange={setOpen} onSaved={refresh} />

      {rows.length === 0 && !fetching ? (
        <EmptyState icon={<ServerCog className="h-8 w-8" />} title="No local services" description="Register a local_stdio service to supervise it." />
      ) : (
        <Card padding="none">
          <ul className="divide-y divide-border">
            {rows.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground font-mono">{s.key}</p>
                  <p className="text-xs text-muted-foreground">{s.kind} · restarts {s.restartCount}{s.pid ? ` · pid ${s.pid}` : ""}{s.lastError ? ` · ${s.lastError}` : ""}</p>
                </div>
                <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
