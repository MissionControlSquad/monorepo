"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "urql";
import { PLUGINS_QUERY } from "@/lib/graphql/queries";
import { INSTALL_PLUGIN, SET_PLUGIN_ENABLED, UNINSTALL_PLUGIN } from "@/lib/graphql/mutations";
import { Button, Card, Badge } from "@/components/ui";

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

  const [manifest, setManifest] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  async function onInstall() {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(manifest);
    } catch {
      return setError("Manifest is not valid JSON");
    }
    setBusy("install");
    try {
      const res = await install({ manifest: parsed });
      if (res.error) {
        setError(res.error.graphQLErrors[0]?.message ?? "Install failed");
        return;
      }
      setManifest("");
      refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Plugins</h1>
        <p className="text-sm text-muted-foreground">
          Install plugins by manifest. Declared capabilities are recorded for review — plugin
          execution is not yet enabled on this instance.
        </p>
      </div>

      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">Install</h2>
          <Button size="sm" variant="secondary" onClick={() => setManifest(SAMPLE)}>
            Load sample
          </Button>
        </div>
        <textarea
          className="h-40 w-full rounded border border-border bg-background px-3 py-1.5 font-mono text-xs"
          placeholder="Paste a plugin manifest JSON…"
          value={manifest}
          onChange={(e) => setManifest(e.target.value)}
        />
        <div className="flex justify-end">
          <Button size="sm" disabled={!manifest.trim() || busy === "install"} onClick={onInstall}>
            Install plugin
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>

      {plugins.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">No plugins installed.</Card>
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
              <Button
                size="sm"
                variant="secondary"
                disabled={busy === p.pluginId}
                onClick={() => act(() => uninstall({ pluginId: p.pluginId }), p.pluginId)}
              >
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
    </div>
  );
}
