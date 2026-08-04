"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { Puzzle } from "lucide-react";
import { ADAPTER_PLUGINS_QUERY } from "@/lib/graphql/queries";
import { DELETE_ADAPTER_PLUGIN } from "@/lib/graphql/mutations";
import { Button, Card, Badge, EmptyState } from "@/components/ui";
import { AdapterPluginDialog } from "@/components/dialogs/AdapterPluginDialog";

// Adapter-plugin store (parity #5). Admin. Declarative runtime adapters (base + baked template, zero
// code-exec). Loaded into the in-process registry at startup.
interface AdapterPlugin {
  id: string; key: string; displayName: string | null; base: string; models: string[]; supportsModel: boolean; enabled: boolean;
}
export default function AdapterPluginsPage() {
  const [{ data, fetching }, refetch] = useQuery<{ adapterPlugins: AdapterPlugin[] }>({ query: ADAPTER_PLUGINS_QUERY });
  const [, del] = useMutation(DELETE_ADAPTER_PLUGIN);
  const [open, setOpen] = useState(false);
  const rows = data?.adapterPlugins ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  return (
    <div className="mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Adapter plugins</h1>
          <p className="text-sm text-muted-foreground">Declarative runtime adapters (base + template). Zero code execution.</p>
        </div>
        <Button onClick={() => setOpen(true)}>Add adapter</Button>
      </div>

      <AdapterPluginDialog open={open} onOpenChange={setOpen} onSaved={refresh} />

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
