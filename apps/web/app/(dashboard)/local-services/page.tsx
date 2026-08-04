"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { ServerCog } from "lucide-react";
import { LOCAL_SERVICES_QUERY } from "@/lib/graphql/queries";
import { REGISTER_LOCAL_SERVICE } from "@/lib/graphql/mutations";
import { Button, Card, Badge, Input, EmptyState } from "@/components/ui";

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
  const rows = data?.localServices ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Local services</h1>
        <p className="text-sm text-muted-foreground">Supervised local_stdio services (e.g. MCP slots).</p>
      </div>
      <Card padding="lg" className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Register service</h2>
        <div className="flex flex-wrap items-end gap-2">
          <Input placeholder="Key (e.g. mcp:filesystem)" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} className="w-56" />
          <Input placeholder="Launch command" value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })} className="w-64" />
          <Button onClick={async () => { if (form.key.trim()) { await register(form); setForm({ key: "", command: "" }); refresh(); } }}>Register</Button>
        </div>
      </Card>
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
