"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "urql";
import { Boxes } from "lucide-react";
import { Card, Badge, Button, Spinner, EmptyState } from "@/components/ui";

// Epic #2 (Adapter Manager): instance-admin view of installed provider adapters. MULTI_PROVIDER_ADAPTERS
// gated. Lists each adapter with its transport/auth kind + model-profile count and lets an admin
// enable/disable it. The builtIn openclaw-gateway can never be disabled (existing agents rely on it).

const ADAPTERS_QUERY = `
  query {
    agentAdapters {
      type
      displayName
      transport
      authKind
      version
      enabled
      builtIn
      modelProfiles { id }
    }
  }
`;

const SET_ADAPTER_ENABLED = `
  mutation ($type: String!, $enabled: Boolean!) {
    setAdapterEnabled(adapterType: $type, enabled: $enabled) {
      type
      enabled
    }
  }
`;

const INSTALL_ADAPTER = `
  mutation ($type: String!, $displayName: String!, $transport: String, $authKind: String) {
    installAdapter(type: $type, displayName: $displayName, transport: $transport, authKind: $authKind) {
      type
    }
  }
`;

const REMOVE_ADAPTER = `
  mutation ($adapterType: String!) {
    removeAdapter(adapterType: $adapterType)
  }
`;

const TRANSPORTS = ["local", "gateway", "cloud"];
const AUTH_KINDS = ["none", "apiKey", "subscription", "secretBinding"];

interface Adapter {
  type: string;
  displayName: string;
  transport: string;
  authKind: string;
  version: string;
  enabled: boolean;
  builtIn: boolean;
  modelProfiles: { id: string }[];
}

export default function AdaptersPage() {
  const [{ data, fetching }, refetch] = useQuery<{ agentAdapters: Adapter[] }>({
    query: ADAPTERS_QUERY,
  });
  const [, setEnabled] = useMutation(SET_ADAPTER_ENABLED);
  const [, installAdapter] = useMutation(INSTALL_ADAPTER);
  const [, removeAdapter] = useMutation(REMOVE_ADAPTER);
  const [busy, setBusy] = useState<string | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [form, setForm] = useState({
    type: "",
    displayName: "",
    transport: "local",
    authKind: "apiKey",
  });
  const [installError, setInstallError] = useState<string | null>(null);
  const adapters = useMemo(() => data?.agentAdapters ?? [], [data]);

  async function toggle(a: Adapter) {
    setBusy(a.type);
    try {
      await setEnabled({ type: a.type, enabled: !a.enabled });
      refetch({ requestPolicy: "network-only" });
    } finally {
      setBusy(null);
    }
  }

  async function onInstall() {
    setInstallError(null);
    if (!form.type.trim() || !form.displayName.trim()) {
      setInstallError("Type and display name are required");
      return;
    }
    setBusy("install");
    try {
      const res = await installAdapter({
        type: form.type.trim(),
        displayName: form.displayName.trim(),
        transport: form.transport,
        authKind: form.authKind,
      });
      if (res.error) {
        setInstallError(res.error.graphQLErrors[0]?.message ?? "Install failed");
        return;
      }
      setForm({ type: "", displayName: "", transport: "local", authKind: "apiKey" });
      setShowInstall(false);
      refetch({ requestPolicy: "network-only" });
    } finally {
      setBusy(null);
    }
  }

  async function onRemove(a: Adapter) {
    if (!confirm(`Remove adapter "${a.displayName}"?`)) return;
    setBusy(a.type);
    try {
      await removeAdapter({ adapterType: a.type });
      refetch({ requestPolicy: "network-only" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto space-y-4 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Adapters</h1>
          <p className="text-sm text-muted-foreground">
            Provider adapters agents can run on. Enable the ones your organization uses; assign one
            to an agent from its settings. The built-in gateway is always available.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setShowInstall((v) => !v)}>
          {showInstall ? "Cancel" : "Install adapter"}
        </Button>
      </div>

      {showInstall && (
        <Card className="space-y-3 p-4">
          <h2 className="text-sm font-semibold text-foreground">Register an external adapter</h2>
          <p className="-mt-1 text-xs text-muted-foreground">
            Adds the adapter to the registry so it can be enabled and assigned. It starts disabled.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className="rounded border border-border bg-background px-3 py-1.5 text-sm"
              placeholder="type (e.g. cursor-cloud)"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            />
            <input
              className="rounded border border-border bg-background px-3 py-1.5 text-sm"
              placeholder="Display name"
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            />
            <select
              className="rounded border border-border bg-background px-2 py-1.5 text-sm"
              value={form.transport}
              onChange={(e) => setForm((f) => ({ ...f, transport: e.target.value }))}
            >
              {TRANSPORTS.map((tr) => (
                <option key={tr} value={tr}>
                  transport: {tr}
                </option>
              ))}
            </select>
            <select
              className="rounded border border-border bg-background px-2 py-1.5 text-sm"
              value={form.authKind}
              onChange={(e) => setForm((f) => ({ ...f, authKind: e.target.value }))}
            >
              {AUTH_KINDS.map((ak) => (
                <option key={ak} value={ak}>
                  auth: {ak}
                </option>
              ))}
            </select>
          </div>
          {installError && <p className="text-sm text-destructive">{installError}</p>}
          <div className="flex justify-end">
            <Button size="sm" disabled={busy === "install"} onClick={onInstall}>
              Install
            </Button>
          </div>
        </Card>
      )}

      {fetching && adapters.length === 0 ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : adapters.length === 0 ? (
        <EmptyState
          icon={<Boxes className="h-8 w-8" />}
          title="No adapters installed"
          description="Provider adapters appear here once installed."
        />
      ) : (
        <div className="space-y-2">
          {adapters.map((a) => (
            <Card key={a.type} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{a.displayName}</span>
                  {a.builtIn && <Badge variant="blue">Built-in</Badge>}
                  <Badge variant={a.enabled ? "green" : "gray"}>
                    {a.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <code className="rounded bg-muted px-1.5 py-0.5">{a.type}</code>
                  <span>transport: {a.transport}</span>
                  <span>auth: {a.authKind}</span>
                  <span>v{a.version}</span>
                  <span>
                    {a.modelProfiles.length} model{a.modelProfiles.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant={a.enabled ? "secondary" : "primary"}
                  size="sm"
                  disabled={busy === a.type || (a.builtIn && a.enabled)}
                  loading={busy === a.type}
                  onClick={() => toggle(a)}
                  title={
                    a.builtIn && a.enabled ? "The built-in adapter cannot be disabled" : undefined
                  }
                >
                  {a.enabled ? "Disable" : "Enable"}
                </Button>
                {!a.builtIn && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy === a.type}
                    onClick={() => onRemove(a)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
