"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import {
  ENVIRONMENTS_QUERY,
  ENVIRONMENT_CAPABILITIES_QUERY,
  WORKSPACE_EXECUTION_POLICY_QUERY,
} from "@/lib/graphql/queries";
import {
  CREATE_ENVIRONMENT,
  UPDATE_ENVIRONMENT,
  ARCHIVE_ENVIRONMENT,
  DELETE_ENVIRONMENT,
  PROBE_ENVIRONMENT,
  SET_WORKSPACE_EXECUTION_MODE,
} from "@/lib/graphql/mutations";
import { useFeatureFlags } from "@/components/context/FeatureFlagContext";
import { FLAG_KEYS } from "@agentcenter/utils";
import { Button, Card, Badge } from "@/components/ui";
import { Container, ShieldCheck } from "lucide-react";

// Tier D / Phase 3: Environments dashboard — the first-class "where/how a run executes" model.
// ENVIRONMENTS-gated in nav; every mutation re-checks the flag + admin server-side. Config secrets are
// referenced by vault name ({secretRef}); the masked `configPublic` is all the client ever sees.

const DRIVER_VARIANT: Record<string, "green" | "yellow" | "gray" | "red"> = {
  local: "gray",
  ssh: "yellow",
  sandbox: "green",
  plugin: "red",
};

interface Environment {
  id: string;
  name: string;
  description: string | null;
  driver: string;
  status: string;
  configPublic: Record<string, unknown>;
  envVars: Record<string, string>;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
interface ProviderCap {
  key: string;
  displayName: string;
  isolating: boolean;
  credentialKeys: string[];
}
interface Capabilities {
  drivers: string[];
  sandboxProviders: ProviderCap[];
}

const DRIVER_HELP: Record<string, string> = {
  local: "Runs on the control-plane host. Not for untrusted/low-trust agents.",
  ssh: "Runs on a reachable server over SSH (host + key from the vault).",
  sandbox: "Provisions an isolated sandbox per run (pick a provider below).",
  plugin: "Delegates to a registered environment plugin.",
};

export default function EnvironmentsPage() {
  const [{ data }, refetch] = useQuery<{ environments: Environment[] }>({
    query: ENVIRONMENTS_QUERY,
  });
  const [{ data: capData }] = useQuery<{ environmentCapabilities: Capabilities }>({
    query: ENVIRONMENT_CAPABILITIES_QUERY,
  });
  const [, createEnv] = useMutation(CREATE_ENVIRONMENT);
  const [, archiveEnv] = useMutation(ARCHIVE_ENVIRONMENT);
  const [, deleteEnv] = useMutation(DELETE_ENVIRONMENT);
  const [, updateEnv] = useMutation(UPDATE_ENVIRONMENT);
  const [, probeEnvMut] = useMutation(PROBE_ENVIRONMENT);

  const { isEnabled } = useFeatureFlags();
  const policyEnabled = isEnabled(FLAG_KEYS.EXECUTION_POLICY);

  const envs = data?.environments ?? [];
  const caps = capData?.environmentCapabilities;
  const drivers = caps?.drivers ?? ["local", "ssh", "sandbox", "plugin"];
  const providers = caps?.sandboxProviders ?? [];

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [probe, setProbe] = useState<
    Record<string, { ok: boolean; summary: string; details?: string | null }>
  >({});
  const [form, setForm] = useState({
    name: "",
    driver: "local",
    description: "",
    // sandbox
    provider: "",
    // ssh
    host: "",
    username: "root",
    keySecret: "",
  });

  const refresh = () => refetch({ requestPolicy: "network-only" });

  function buildConfig(): Record<string, unknown> {
    if (form.driver === "sandbox") return { provider: form.provider };
    if (form.driver === "ssh") {
      const cfg: Record<string, unknown> = { host: form.host.trim() };
      if (form.username.trim()) cfg.username = form.username.trim();
      if (form.keySecret.trim()) cfg.privateKey = { secretRef: { name: form.keySecret.trim() } };
      return cfg;
    }
    return {};
  }

  async function onCreate() {
    setError(null);
    if (!form.name.trim()) return setError("Name is required");
    if (form.driver === "sandbox" && !form.provider) return setError("Pick a sandbox provider");
    if (form.driver === "ssh" && !form.host.trim()) return setError("SSH host is required");
    setBusy("create");
    try {
      const res = await createEnv({
        name: form.name.trim(),
        driver: form.driver,
        description: form.description.trim() || null,
        config: buildConfig(),
      });
      if (res.error) return setError(res.error.graphQLErrors[0]?.message ?? "Create failed");
      setForm((f) => ({ ...f, name: "", description: "", host: "", keySecret: "", provider: "" }));
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onArchive(id: string) {
    setBusy(id);
    try {
      await archiveEnv({ id });
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onDelete(id: string) {
    setError(null);
    setBusy(id);
    try {
      const res = await deleteEnv({ id });
      if (res.error) return setError(res.error.graphQLErrors[0]?.message ?? "Delete blocked");
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onReactivate(id: string) {
    setBusy(id);
    try {
      await updateEnv({ id });
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onProbe(id: string) {
    setError(null);
    setBusy(`probe-${id}`);
    try {
      const res = await probeEnvMut({ id });
      if (res.error) return setError(res.error.graphQLErrors[0]?.message ?? "Probe failed");
      const r = res.data.probeEnvironment;
      setProbe((p) => ({ ...p, [id]: { ok: r.ok, summary: r.summary, details: r.details } }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Environments</h1>
        <p className="text-sm text-muted-foreground">
          Define where and how a run executes — a driver (local, SSH, sandbox, or plugin), its
          config, and env vars. Agents bind to an environment. Secrets are referenced by vault name
          and never leave the server.
        </p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* ── Create ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Container className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">New environment</h2>
        </div>
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            <input
              className="min-w-[10rem] flex-1 rounded border border-border bg-background px-3 py-1.5 text-sm"
              placeholder="name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <select
              className="rounded border border-border bg-background px-3 py-1.5 text-sm"
              value={form.driver}
              onChange={(e) => setForm((f) => ({ ...f, driver: e.target.value }))}
            >
              {drivers.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">{DRIVER_HELP[form.driver]}</p>

          {form.driver === "sandbox" && (
            <select
              className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
              value={form.provider}
              onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
            >
              <option value="">— pick a provider —</option>
              {providers.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.displayName} {p.isolating ? "(isolated)" : "(on host)"}
                </option>
              ))}
            </select>
          )}

          {form.driver === "ssh" && (
            <div className="flex flex-wrap gap-2">
              <input
                className="min-w-[10rem] flex-1 rounded border border-border bg-background px-3 py-1.5 font-mono text-sm"
                placeholder="host or IP"
                value={form.host}
                onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
              />
              <input
                className="w-28 rounded border border-border bg-background px-3 py-1.5 font-mono text-sm"
                placeholder="user"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              />
              <input
                className="min-w-[10rem] flex-1 rounded border border-border bg-background px-3 py-1.5 font-mono text-sm"
                placeholder="vault secret name for private key"
                value={form.keySecret}
                onChange={(e) => setForm((f) => ({ ...f, keySecret: e.target.value }))}
              />
            </div>
          )}

          <input
            className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
            placeholder="description (optional)"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              loading={busy === "create"}
              disabled={busy === "create"}
              onClick={onCreate}
            >
              Create environment
            </Button>
          </div>
        </Card>
      </section>

      {/* ── List ───────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Environments</h2>
        {envs.length === 0 && <p className="text-sm text-muted-foreground">No environments yet.</p>}
        {envs.map((env) => (
          <Card key={env.id} className="space-y-2 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{env.name}</span>
                <Badge variant={DRIVER_VARIANT[env.driver] ?? "gray"}>{env.driver}</Badge>
                {env.status === "archived" && <Badge variant="gray">archived</Badge>}
              </div>
              <span className="flex items-center gap-3">
                <button
                  onClick={() => onProbe(env.id)}
                  disabled={busy === `probe-${env.id}`}
                  className="text-xs text-muted-foreground transition hover:text-foreground disabled:opacity-50"
                >
                  {busy === `probe-${env.id}` ? "Probing…" : "Probe"}
                </button>
                {env.status === "active" ? (
                  <button
                    onClick={() => onArchive(env.id)}
                    disabled={busy === env.id}
                    className="text-xs text-muted-foreground transition hover:text-foreground disabled:opacity-50"
                  >
                    Archive
                  </button>
                ) : (
                  <button
                    onClick={() => onReactivate(env.id)}
                    disabled={busy === env.id}
                    className="text-xs text-muted-foreground transition hover:text-foreground disabled:opacity-50"
                  >
                    Reactivate
                  </button>
                )}
                <button
                  onClick={() => onDelete(env.id)}
                  disabled={busy === env.id}
                  className="text-xs text-destructive transition hover:underline disabled:opacity-50"
                >
                  Delete
                </button>
              </span>
            </div>
            {env.description && <p className="text-xs text-muted-foreground">{env.description}</p>}
            {Object.keys(env.configPublic ?? {}).length > 0 && (
              <pre className="max-h-32 overflow-auto rounded bg-muted/50 p-2 text-xs text-muted-foreground">
                {JSON.stringify(env.configPublic, null, 2)}
              </pre>
            )}
            {probe[env.id] && (
              <p className={`text-xs ${probe[env.id].ok ? "text-success" : "text-destructive"}`}>
                {probe[env.id].ok ? "✓ " : "✗ "}
                {probe[env.id].summary}
                {probe[env.id].details ? ` — ${probe[env.id].details}` : ""}
              </p>
            )}
          </Card>
        ))}
      </section>

      {policyEnabled && <ExecutionPolicySection />}
    </div>
  );
}

// ── Execution policy (Plan 4) — force runs onto isolated kubernetes, or allow any target ──
function ExecutionPolicySection() {
  const [{ data }, refetch] = useQuery<{
    workspaceExecutionPolicy: { executionMode: string; enableIsolatedWorkspaces: boolean };
  }>({ query: WORKSPACE_EXECUTION_POLICY_QUERY });
  const [, setMode] = useMutation(SET_WORKSPACE_EXECUTION_MODE);
  const [busy, setBusy] = useState(false);
  const policy = data?.workspaceExecutionPolicy;
  const mode = policy?.executionMode ?? "any";

  async function apply(executionMode: string) {
    setBusy(true);
    try {
      await setMode({ executionMode });
      refetch({ requestPolicy: "network-only" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Execution policy</h2>
      </div>
      <Card className="space-y-2 p-4">
        <p className="text-sm text-muted-foreground">
          Force every run onto an isolated kubernetes sandbox, or allow any target. Enforced
          fail-closed before a sandbox is provisioned.
        </p>
        <div className="flex items-center gap-2">
          <Badge variant={mode === "kubernetes" ? "green" : "gray"}>{mode}</Badge>
          <Button
            size="sm"
            variant="secondary"
            loading={busy}
            disabled={busy}
            onClick={() => apply(mode === "kubernetes" ? "any" : "kubernetes")}
          >
            {mode === "kubernetes" ? "Allow any target" : "Force kubernetes only"}
          </Button>
        </div>
      </Card>
    </section>
  );
}
