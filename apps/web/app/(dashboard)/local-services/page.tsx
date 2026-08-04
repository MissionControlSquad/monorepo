"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { ServerCog } from "lucide-react";
import { LOCAL_SERVICES_QUERY } from "@/lib/graphql/queries";
import { REGISTER_LOCAL_SERVICE } from "@/lib/graphql/mutations";
import { Button, Card, Badge, Input, EmptyState, FormField, FormDialog } from "@/components/ui";

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
  const [, register] = useMutation(REGISTER_LOCAL_SERVICE);
  const [form, setForm] = useState({ key: "", command: "" });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows = data?.localServices ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function onRegister() {
    if (!form.key.trim()) return;
    setBusy(true);
    const r = await register(form);
    setBusy(false);
    if (r.error) return setError(r.error.message);
    setError(null); setForm({ key: "", command: "" }); setOpen(false); refresh();
  }

  return (
    <div className="mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Local services</h1>
          <p className="text-sm text-muted-foreground">Supervised local_stdio services (e.g. MCP slots).</p>
        </div>
        <Button onClick={() => setOpen(true)}>Register service</Button>
      </div>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Register local service"
        description="Register a local_stdio service so the supervisor watches it."
        onSubmit={onRegister}
        submitLabel="Register"
        busy={busy}
        error={error}
        submitDisabled={!form.key.trim()}
      >
        <FormField label="Key">
          <Input placeholder="e.g. mcp:filesystem" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} />
        </FormField>
        <FormField label="Launch command">
          <Input placeholder="e.g. npx @modelcontextprotocol/server-filesystem" value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })} />
        </FormField>
      </FormDialog>

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
