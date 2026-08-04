"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { Puzzle } from "lucide-react";
import { ADAPTER_PLUGINS_QUERY } from "@/lib/graphql/queries";
import { UPSERT_ADAPTER_PLUGIN, DELETE_ADAPTER_PLUGIN } from "@/lib/graphql/mutations";
import { Button, Card, Badge, Input, EmptyState } from "@/components/ui";

// Adapter-plugin store (parity #5). Admin. Declarative runtime adapters (base + baked template, zero
// code-exec). Loaded into the in-process registry at startup.
interface AdapterPlugin {
  id: string; key: string; displayName: string | null; base: string; models: string[]; supportsModel: boolean; enabled: boolean;
}
export default function AdapterPluginsPage() {
  const [{ data, fetching }, refetch] = useQuery<{ adapterPlugins: AdapterPlugin[] }>({ query: ADAPTER_PLUGINS_QUERY });
  const [, upsert] = useMutation(UPSERT_ADAPTER_PLUGIN);
  const [, del] = useMutation(DELETE_ADAPTER_PLUGIN);
  const [form, setForm] = useState({ key: "", base: "process", template: "" });
  const [error, setError] = useState<string | null>(null);
  const rows = data?.adapterPlugins ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function onAdd() {
    if (!form.key.trim() || !form.template.trim()) return;
    const r = await upsert({ key: form.key, base: form.base, template: form.template.split(/\s+/).filter(Boolean) });
    if (r.error) return setError(r.error.message);
    setError(null); setForm({ key: "", base: "process", template: "" }); refresh();
  }

  return (
    <div className="mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Adapter plugins</h1>
        <p className="text-sm text-muted-foreground">Declarative runtime adapters (base + template). Zero code execution.</p>
      </div>
      <Card padding="lg" className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Add adapter</h2>
        <div className="flex flex-wrap items-end gap-2">
          <Input placeholder="Key (e.g. aider)" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} className="w-40" />
          <select value={form.base} onChange={(e) => setForm({ ...form, base: e.target.value })} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="process">process</option><option value="shell">shell</option><option value="http">http</option>
          </select>
          <Input placeholder="Template (space-separated argv, use {prompt})" value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })} className="w-72" />
          <Button onClick={onAdd}>Add</Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>
      {rows.length === 0 && !fetching ? (
        <EmptyState icon={<Puzzle className="h-8 w-8" />} title="No adapter plugins" description="Add a declarative adapter to make it selectable." />
      ) : (
        <Card padding="none">
          <ul className="divide-y divide-border">
            {rows.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground font-mono">{p.key}</p>
                  <p className="text-xs text-muted-foreground">base {p.base}{p.models.length ? ` · ${p.models.length} models` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={p.enabled ? "green" : "gray"}>{p.enabled ? "enabled" : "disabled"}</Badge>
                  <Button variant="ghost" size="sm" onClick={async () => { await del({ key: p.key }); refresh(); }}>Delete</Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
