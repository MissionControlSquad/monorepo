"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "urql";
import { PLUGINS_QUERY } from "@/lib/graphql/queries";
import { INSTALL_PLUGIN, SET_PLUGIN_ENABLED, UNINSTALL_PLUGIN } from "@/lib/graphql/mutations";
import { Plug } from "lucide-react";
import { Button, Card, Badge, FormField, FormDialog, ConfirmDialog, EmptyState } from "@/components/ui";
import { useResourceDialog, useConfirmDelete } from "@/hooks/useCrud";

// Epic #6: plugin SDK registry. PLUGIN_SDK-gated (experimental, admin). Install a plugin by pasting
// its manifest JSON; enable/disable/uninstall. Capabilities shown are DECLARED, not granted (no
// runtime yet).

interface Plugin {
  id: string;
  pluginId: string;
  version: string;
  displayName: string;
  description: string | null;
  category: string;
  capabilities: string[];
  status: string;
  enabled: boolean;
}

const SAMPLE = JSON.stringify(
  {
    apiVersion: 1,
    id: "acme-connector",
    version: "1.0.0",
    displayName: "Acme Connector",
    description: "Syncs Acme issues",
    category: "connector",
    capabilities: ["projects.read", "issues.create"],
  },
  null,
  2,
);

export default function PluginsPage() {
  const [{ data }, refetch] = useQuery<{ plugins: Plugin[] }>({ query: PLUGINS_QUERY });
  const [, install] = useMutation(INSTALL_PLUGIN);
  const [, setEnabled] = useMutation(SET_PLUGIN_ENABLED);
  const [, uninstall] = useMutation(UNINSTALL_PLUGIN);

  const [busy, setBusy] = useState<string | null>(null);
  const plugins = data?.plugins ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function act(fn: () => Promise<unknown>, key: string) {
    setBusy(key);
    try {
      await fn();
      refresh();
    } finally {
      setBusy(null);
    }
  }

  const dlg = useResourceDialog({
    empty: { manifest: "" },
    submit: async (v) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(v.manifest);
      } catch {
        return "Manifest is not valid JSON";
      }
      const res = await install({ manifest: parsed });
      if (res.error) return res.error.graphQLErrors?.[0]?.message ?? "Install failed";
      return null;
    },
    onDone: refresh,
  });

  const del = useConfirmDelete<Plugin>({
    onDelete: async (p) => {
      const r = await uninstall({ pluginId: p.pluginId });
      return r.error?.message ?? null;
    },
    onDone: refresh,
  });

  return (
    <div className="mx-auto space-y-6 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Plugins</h1>
          <p className="text-sm text-muted-foreground">
            Install plugins by manifest. Declared capabilities are recorded for review — plugin
            execution is not yet enabled on this instance.
          </p>
        </div>
        <Button onClick={dlg.openCreate}>Install plugin</Button>
      </div>

      <FormDialog
        open={dlg.open}
        onOpenChange={dlg.setOpen}
        title="Install plugin"
        description="Paste a plugin manifest JSON. Declared capabilities are recorded for review."
        onSubmit={dlg.onSubmit}
        submitLabel="Install plugin"
        busy={dlg.busy}
        error={dlg.error}
        submitDisabled={!dlg.values.manifest.trim()}
      >
        <FormField label="Manifest JSON">
          <textarea
            className="h-56 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
            placeholder="Paste a plugin manifest JSON…"
            value={dlg.values.manifest}
            onChange={(e) => dlg.set("manifest", e.target.value)}
          />
        </FormField>
        <Button type="button" size="sm" variant="ghost" onClick={() => dlg.set("manifest", SAMPLE)}>
          Load sample
        </Button>
      </FormDialog>

      {plugins.length === 0 && (
        <EmptyState
          icon={<Plug className="h-8 w-8" />}
          title="No plugins installed"
          description="Install a plugin by pasting its manifest."
        />
      )}

      {plugins.map((p) => (
        <Card key={p.id} className="space-y-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-2">
              <Link
                href={`/plugins/${p.pluginId}`}
                className="font-medium text-foreground hover:underline"
              >
                {p.displayName}
              </Link>
              <Badge variant="gray">{p.category}</Badge>
              <Badge variant="blue">v{p.version}</Badge>
              <Badge variant={p.enabled ? "green" : "gray"}>{p.status}</Badge>
            </span>
            <span className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={busy === p.pluginId}
                onClick={() =>
                  act(() => setEnabled({ pluginId: p.pluginId, enabled: !p.enabled }), p.pluginId)
                }
              >
                {p.enabled ? "Disable" : "Enable"}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => del.ask(p)}>
                Uninstall
              </Button>
            </span>
          </div>
          {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
          {p.capabilities.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {p.capabilities.map((c) => (
                <Badge key={c} variant="purple">
                  {c}
                </Badge>
              ))}
            </div>
          )}
        </Card>
      ))}

      <ConfirmDialog
        isOpen={del.isOpen}
        onClose={del.cancel}
        onConfirm={del.confirm}
        title="Uninstall plugin?"
        description={`"${del.target?.displayName}" and its recorded capabilities will be removed.`}
        confirmLabel="Uninstall"
      />
    </div>
  );
}
