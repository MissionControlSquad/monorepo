"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { SECRETS_QUERY, SECRET_PROVIDERS_QUERY } from "@/lib/graphql/queries";
import {
  CREATE_SECRET,
  ROTATE_SECRET,
  BIND_SECRET,
  UNBIND_SECRET,
  SET_SECRET_STATUS,
  CREATE_SECRET_PROVIDER,
  DELETE_SECRET_PROVIDER,
} from "@/lib/graphql/mutations";
import { Button, Card, Badge } from "@/components/ui";

// Epic #5: secrets vault. API-gated by SECRETS_VAULT + buildbase role (admin manages; member views
// metadata). Values are write-only — they are never fetched back, only rotated. Encryption at rest
// is AES-256-GCM server-side.

interface Binding {
  id: string;
  scope: string;
  agentId: string | null;
  adapterType: string | null;
  envVarName: string;
  pinnedVersion: number | null;
}
interface Version {
  version: number;
  retiredAt: string | null;
}
interface Secret {
  id: string;
  name: string;
  description: string | null;
  currentVersion: number;
  status: string;
  providerId: string | null;
  bindings: Binding[];
  versions: Version[];
}
interface Provider {
  id: string;
  name: string;
  kind: string;
  healthy: boolean;
  lastError: string | null;
}

const STATUS_VARIANT: Record<string, "green" | "yellow" | "gray"> = {
  active: "green",
  disabled: "yellow",
  archived: "gray",
};

const PROVIDER_KINDS = ["env", "aws", "vault"];

export default function SecretsPage() {
  const [{ data }, refetch] = useQuery<{ secrets: Secret[] }>({ query: SECRETS_QUERY });
  const [{ data: providerData }, refetchProviders] = useQuery<{ secretProviders: Provider[] }>({
    query: SECRET_PROVIDERS_QUERY,
  });
  const [, createSecret] = useMutation(CREATE_SECRET);
  const [, rotateSecret] = useMutation(ROTATE_SECRET);
  const [, bindSecret] = useMutation(BIND_SECRET);
  const [, unbindSecret] = useMutation(UNBIND_SECRET);
  const [, setStatus] = useMutation(SET_SECRET_STATUS);
  const [, createProvider] = useMutation(CREATE_SECRET_PROVIDER);
  const [, deleteProvider] = useMutation(DELETE_SECRET_PROVIDER);

  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", value: "", description: "", providerId: "" });
  const [providerForm, setProviderForm] = useState({ name: "", kind: "env" });
  const [rotateVal, setRotateVal] = useState<Record<string, string>>({});
  const [bindForm, setBindForm] = useState<Record<string, { env: string; agentId: string }>>({});
  const [error, setError] = useState<string | null>(null);

  const secrets = data?.secrets ?? [];
  const providers = providerData?.secretProviders ?? [];
  const providerName = (id: string | null) =>
    id ? (providers.find((p) => p.id === id)?.name ?? "unknown") : null;
  const refresh = () => refetch({ requestPolicy: "network-only" });
  const refreshProviders = () => refetchProviders({ requestPolicy: "network-only" });

  async function onCreateProvider() {
    setError(null);
    if (!providerForm.name.trim()) return setError("Provider name is required");
    setBusy("provider");
    try {
      const res = await createProvider({
        name: providerForm.name.trim(),
        kind: providerForm.kind,
      });
      if (res.error)
        return setError(res.error.graphQLErrors[0]?.message ?? "Failed to create provider");
      setProviderForm({ name: "", kind: "env" });
      refreshProviders();
    } finally {
      setBusy(null);
    }
  }

  async function onDeleteProvider(id: string) {
    setBusy(id);
    try {
      await deleteProvider({ id });
      refreshProviders();
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onCreate() {
    setError(null);
    if (!form.name.trim()) return setError("Name is required");
    if (!form.value) return setError("Value is required");
    setBusy("create");
    try {
      const res = await createSecret({
        name: form.name.trim(),
        value: form.value,
        description: form.description.trim() || null,
        providerId: form.providerId || null,
      });
      if (res.error) return setError(res.error.graphQLErrors[0]?.message ?? "Failed to create");
      setForm({ name: "", value: "", description: "", providerId: "" });
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onRotate(id: string) {
    const value = rotateVal[id];
    if (!value) return setError("Enter a new value to rotate");
    setBusy(id);
    try {
      const res = await rotateSecret({ id, value });
      if (res.error) return setError(res.error.graphQLErrors[0]?.message ?? "Failed to rotate");
      setRotateVal((m) => ({ ...m, [id]: "" }));
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onBind(id: string) {
    const bf = bindForm[id];
    if (!bf?.env || !bf?.agentId) return setError("Env var name and agent id are required to bind");
    setBusy(id);
    try {
      const res = await bindSecret({
        secretId: id,
        scope: "agent",
        envVarName: bf.env,
        agentId: bf.agentId,
      });
      if (res.error) return setError(res.error.graphQLErrors[0]?.message ?? "Failed to bind");
      setBindForm((m) => ({ ...m, [id]: { env: "", agentId: "" } }));
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onUnbind(bindingId: string) {
    setBusy(bindingId);
    try {
      await unbindSecret({ id: bindingId });
      refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <h1 className="text-lg font-semibold text-foreground">Secrets</h1>
      <p className="-mt-4 text-sm text-muted-foreground">
        Encrypted at rest (AES-256-GCM). Values are write-only — they are never shown again, only
        rotated. Bind a secret to an agent to inject it as an env var.
      </p>

      {/* Provider configs — point the vault at an external backend (aws/vault) or the local
          envelope (env). `config` holds only non-secret settings; backend creds are Secrets. */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Providers</h2>
          <span className="text-xs text-muted-foreground">
            Where secrets are stored. Default is the local envelope.
          </span>
        </div>
        <div className="space-y-1">
          {providers.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No custom providers — secrets use the local AES-256-GCM envelope.
            </p>
          )}
          {providers.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                <Badge variant="blue">{p.kind}</Badge>
                <span className="text-foreground">{p.name}</span>
                <Badge variant={p.healthy ? "green" : "gray"}>
                  {p.healthy ? "healthy" : "unchecked"}
                </Badge>
                {p.lastError && <span className="text-xs text-destructive">{p.lastError}</span>}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy === p.id}
                onClick={() => onDeleteProvider(p.id)}
              >
                Delete
              </Button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 border-t border-border pt-3">
          <input
            className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
            placeholder="Provider name (e.g. prod-vault)"
            value={providerForm.name}
            onChange={(e) => setProviderForm((f) => ({ ...f, name: e.target.value }))}
          />
          <select
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            value={providerForm.kind}
            onChange={(e) => setProviderForm((f) => ({ ...f, kind: e.target.value }))}
          >
            {PROVIDER_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy === "provider"}
            onClick={onCreateProvider}
          >
            Add provider
          </Button>
        </div>
      </Card>

      {/* Create */}
      <Card className="space-y-3 p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input
            className="rounded border border-border bg-background px-3 py-1.5 text-sm"
            placeholder="Name (e.g. OPENAI_API_KEY)"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            className="rounded border border-border bg-background px-3 py-1.5 text-sm"
            placeholder="Value (write-only)"
            type="password"
            value={form.value}
            onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
          />
          <input
            className="rounded border border-border bg-background px-3 py-1.5 text-sm"
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <select
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            value={form.providerId}
            onChange={(e) => setForm((f) => ({ ...f, providerId: e.target.value }))}
          >
            <option value="">local envelope</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.kind})
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end">
          <Button size="sm" disabled={busy === "create"} onClick={onCreate}>
            Add secret
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>

      {secrets.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">No secrets yet.</Card>
      )}

      {secrets.map((s) => (
        <Card key={s.id} className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{s.name}</span>
            <Badge variant="gray">v{s.currentVersion}</Badge>
            <Badge variant={STATUS_VARIANT[s.status] ?? "gray"}>{s.status}</Badge>
            {s.providerId && <Badge variant="blue">{providerName(s.providerId)}</Badge>}
            {s.description && (
              <span className="text-sm text-muted-foreground">{s.description}</span>
            )}
            <select
              className="ml-auto rounded border border-border bg-background px-2 py-1 text-xs"
              value={s.status}
              onChange={async (e) => {
                await setStatus({ id: s.id, status: e.target.value });
                refresh();
              }}
            >
              <option value="active">active</option>
              <option value="disabled">disabled</option>
              <option value="archived">archived</option>
            </select>
          </div>

          {/* Bindings */}
          <div className="space-y-1">
            {s.bindings.length === 0 && (
              <p className="text-xs text-muted-foreground">No bindings.</p>
            )}
            {s.bindings.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <Badge variant="blue">{b.envVarName}</Badge>
                  <span className="text-muted-foreground">
                    {b.scope === "agent"
                      ? `agent ${b.agentId?.slice(0, 8)}`
                      : `adapter ${b.adapterType}`}
                    {b.pinnedVersion ? ` · pinned v${b.pinnedVersion}` : ""}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy === b.id}
                  onClick={() => onUnbind(b.id)}
                >
                  Unbind
                </Button>
              </div>
            ))}
          </div>

          {/* Actions: rotate + bind */}
          <div className="grid grid-cols-1 gap-2 border-t border-border pt-3 sm:grid-cols-2">
            <div className="flex gap-2">
              <input
                className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
                placeholder="New value (rotate)"
                type="password"
                value={rotateVal[s.id] ?? ""}
                onChange={(e) => setRotateVal((m) => ({ ...m, [s.id]: e.target.value }))}
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={busy === s.id}
                onClick={() => onRotate(s.id)}
              >
                Rotate
              </Button>
            </div>
            <div className="flex gap-2">
              <input
                className="w-1/2 rounded border border-border bg-background px-2 py-1.5 text-sm"
                placeholder="ENV_VAR"
                value={bindForm[s.id]?.env ?? ""}
                onChange={(e) =>
                  setBindForm((m) => ({
                    ...m,
                    [s.id]: { env: e.target.value, agentId: m[s.id]?.agentId ?? "" },
                  }))
                }
              />
              <input
                className="w-1/2 rounded border border-border bg-background px-2 py-1.5 text-sm"
                placeholder="agent id"
                value={bindForm[s.id]?.agentId ?? ""}
                onChange={(e) =>
                  setBindForm((m) => ({
                    ...m,
                    [s.id]: { env: m[s.id]?.env ?? "", agentId: e.target.value },
                  }))
                }
              />
              <Button size="sm" disabled={busy === s.id} onClick={() => onBind(s.id)}>
                Bind
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
