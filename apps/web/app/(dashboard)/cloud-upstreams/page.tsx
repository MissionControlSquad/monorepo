"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { GitBranch } from "lucide-react";
import { CLOUD_UPSTREAMS_QUERY } from "@/lib/graphql/queries";
import { UPSERT_CLOUD_UPSTREAM, DELETE_CLOUD_UPSTREAM } from "@/lib/graphql/mutations";
import { Button, Card, Badge, Input, EmptyState } from "@/components/ui";

// Cloud upstreams (parity #24). CLOUD_UPSTREAMS-gated, admin. Configure a project's remote git
// fork/sync and see the drift state (up_to_date/behind/ahead/diverged). The fetch/merge/push itself is
// the infra-gated git op done elsewhere; this manages the relationship + records drift.
interface Upstream {
  id: string; projectId: string; name: string; remoteUrl: string; remoteRef: string;
  syncState: string; ahead: number; behind: number; lastError: string | null; lastSyncedAt: string | null;
}
const stateVariant = (s: string) =>
  s === "up_to_date" ? "green" : s === "diverged" ? "red" : s === "behind" || s === "ahead" ? "yellow" : "gray";

export default function CloudUpstreamsPage() {
  const [{ data, fetching }, refetch] = useQuery<{ cloudUpstreams: Upstream[] }>({ query: CLOUD_UPSTREAMS_QUERY });
  const [, upsert] = useMutation(UPSERT_CLOUD_UPSTREAM);
  const [, del] = useMutation(DELETE_CLOUD_UPSTREAM);
  const [form, setForm] = useState({ projectId: "", name: "origin", remoteUrl: "", remoteRef: "main" });
  const [error, setError] = useState<string | null>(null);
  const rows = data?.cloudUpstreams ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function onAdd() {
    if (!form.projectId.trim() || !form.remoteUrl.trim()) return;
    const r = await upsert(form);
    if (r.error) return setError(r.error.message);
    setError(null); setForm({ projectId: "", name: "origin", remoteUrl: "", remoteRef: "main" }); refresh();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Cloud upstreams</h1>
        <p className="text-sm text-muted-foreground">Remote git fork/sync per project, with drift state.</p>
      </div>
      <Card padding="lg" className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Add upstream</h2>
        <div className="flex flex-wrap items-end gap-2">
          <Input placeholder="Project ID" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} className="w-40" />
          <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-32" />
          <Input placeholder="Remote URL" value={form.remoteUrl} onChange={(e) => setForm({ ...form, remoteUrl: e.target.value })} className="w-64" />
          <Input placeholder="Ref" value={form.remoteRef} onChange={(e) => setForm({ ...form, remoteRef: e.target.value })} className="w-24" />
          <Button onClick={onAdd}>Add</Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>
      {rows.length === 0 && !fetching ? (
        <EmptyState icon={<GitBranch className="h-8 w-8" />} title="No upstreams" description="Add a remote to track drift." />
      ) : (
        <Card padding="none">
          <ul className="divide-y divide-border">
            {rows.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{u.name} · <span className="font-mono text-xs">{u.remoteUrl}</span></p>
                  <p className="text-xs text-muted-foreground">{u.remoteRef} · ↑{u.ahead} ↓{u.behind}{u.lastError ? ` · ${u.lastError}` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={stateVariant(u.syncState)}>{u.syncState}</Badge>
                  <Button variant="ghost" size="sm" onClick={async () => { await del({ id: u.id }); refresh(); }}>Delete</Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
