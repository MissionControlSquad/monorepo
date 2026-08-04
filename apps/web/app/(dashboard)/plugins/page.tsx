"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "urql";
import { PLUGINS_QUERY } from "@/lib/graphql/queries";
import { SET_PLUGIN_ENABLED, UNINSTALL_PLUGIN } from "@/lib/graphql/mutations";
import { Plug } from "lucide-react";
import { Button, Card, Badge, ConfirmDialog, EmptyState } from "@/components/ui";
import { PluginInstallDialog } from "@/components/dialogs/PluginInstallDialog";
import { useConfirmDelete } from "@/hooks/useCrud";

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

export default function PluginsPage() {
  const [{ data }, refetch] = useQuery<{ plugins: Plugin[] }>({ query: PLUGINS_QUERY });
  const [, setEnabled] = useMutation(SET_PLUGIN_ENABLED);
  const [, uninstall] = useMutation(UNINSTALL_PLUGIN);

  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
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
        <Button onClick={() => setOpen(true)}>Install plugin</Button>
      </div>

      <PluginInstallDialog open={open} onOpenChange={setOpen} onSaved={refresh} />

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
