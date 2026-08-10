"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "urql";
import { toast } from "sonner";
import { Loader2, AlertCircle, AlertTriangle, Trash2 } from "lucide-react";
import { PLUGIN_QUERY, PLUGIN_GRANTS_QUERY } from "@/lib/graphql/queries";
import {
  SET_PLUGIN_ENABLED,
  UNINSTALL_PLUGIN,
  SET_PLUGIN_CONFIG,
  CLEAR_PLUGIN_ERROR,
  GRANT_PLUGIN_CAPABILITY,
  REVOKE_PLUGIN_CAPABILITY,
} from "@/lib/graphql/mutations";
import { Breadcrumbs, Button, Card, Badge, PageLayout, Tooltip } from "@/components/ui";
import { JsonSchemaForm } from "@/components/common/JsonSchemaForm";
import { adapterConfigFields } from "@agentcenter/utils";

// Epic #6: per-plugin detail — manifest info, capabilities, tools/jobs, a config form rendered from
// the manifest's configSchema (shared adapterConfigFields helper), and the error surface + lifecycle
// (enable/disable, clear error, uninstall). Runtime execution is deferred.

interface Manifest {
  id?: string;
  configSchema?: unknown;
  tools?: { name: string; displayName: string; description: string }[];
  jobs?: { jobKey: string; displayName: string; schedule?: string }[];
}
interface Plugin {
  id: string;
  pluginId: string;
  displayName: string;
  description: string | null;
  version: string;
  category: string;
  capabilities: string[];
  status: string;
  enabled: boolean;
  manifest: Manifest;
  config: Record<string, unknown> | null;
  lastError: string | null;
}

const STATUS_VARIANT: Record<string, "green" | "gray" | "red"> = {
  installed: "green",
  disabled: "gray",
  error: "red",
};

interface Grant {
  id: string;
  capability: string;
  grantedAt: string;
}

// Human-readable descriptions for capability tooltips. Falls back to the raw key for anything unmapped.
const CAPABILITY_DESCRIPTIONS: Record<string, string> = {
  "agent.tools.register":
    "Contribute tools to the gateway — required for this plugin's tools to be dispatchable.",
  "jobs.schedule": "Run scheduled/queued jobs in the plugin worker.",
  "plugin.state.read": "Read the plugin's own key/value state.",
  "plugin.state.write": "Write the plugin's own key/value state.",
  "webhooks.receive": "Receive inbound webhooks routed to the plugin.",
  "telemetry.track": "Emit telemetry events.",
  "agents.invoke": "Invoke agents.",
  "agents.read": "Read agent metadata.",
  "issues.read": "Read issues.",
  "issues.create": "Create issues.",
  "projects.read": "Read projects.",
};
function capabilityHint(cap: string): string {
  return (
    CAPABILITY_DESCRIPTIONS[cap] ??
    "Platform capability. Fail-closed: refused at runtime unless granted."
  );
}

export function PluginDetailPage({ pluginId }: { pluginId: string }) {
  const router = useRouter();
  const [{ data, fetching }, refetch] = useQuery<{ plugin: Plugin | null }>({
    query: PLUGIN_QUERY,
    variables: { pluginId },
  });
  const [, setEnabled] = useMutation(SET_PLUGIN_ENABLED);
  const [, uninstall] = useMutation(UNINSTALL_PLUGIN);
  const [, setConfig] = useMutation(SET_PLUGIN_CONFIG);
  const [, clearError] = useMutation(CLEAR_PLUGIN_ERROR);
  const [, grantCap] = useMutation(GRANT_PLUGIN_CAPABILITY);
  const [, revokeCap] = useMutation(REVOKE_PLUGIN_CAPABILITY);

  // Runtime capability grants (PLUGIN_RUNTIME). If the flag is off the resolver errors — we degrade to a
  // read-only "runtime disabled" note and hide the grant/revoke controls.
  const [{ data: grantsData, error: grantsError }, refetchGrants] = useQuery<{
    pluginGrants: Grant[];
  }>({ query: PLUGIN_GRANTS_QUERY, variables: { pluginId } });
  const runtimeEnabled = !grantsError;
  const grantedSet = useMemo(
    () => new Set((grantsData?.pluginGrants ?? []).map((g) => g.capability)),
    [grantsData],
  );

  const plugin = data?.plugin;
  const fields = useMemo(
    () => (plugin ? adapterConfigFields(plugin.manifest?.configSchema) : []),
    [plugin],
  );
  const [config, setLocalConfig] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (plugin) setLocalConfig(plugin.config ?? {});
  }, [plugin]);

  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function run(fn: () => Promise<{ error?: unknown }>, ok?: string) {
    setBusy(true);
    try {
      const res = await fn();
      if (res.error) {
        toast.error(String((res.error as Error).message).replace("[GraphQL] ", ""));
        return false;
      }
      if (ok) toast.success(ok);
      refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Uninstall this plugin? Its configuration is removed.")) return;
    const ok = await run(() => uninstall({ pluginId }), "Plugin uninstalled");
    if (ok) router.push("/plugins");
  }

  const refreshGrants = () => refetchGrants({ requestPolicy: "network-only" });

  async function grant(capability: string) {
    setBusy(true);
    try {
      const res = await grantCap({ pluginId, capability });
      if (res.error) {
        toast.error(String((res.error as Error).message).replace("[GraphQL] ", ""));
        return;
      }
      toast.success(`Granted ${capability}`);
      refreshGrants();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(capability: string) {
    // Confirm dialog spelling out the blast radius — revoking makes the runtime refuse (fail-closed)
    // every tool/job that relies on this capability.
    const impact =
      capability === "agent.tools.register"
        ? "This plugin's tools will stop dispatching (fail-closed)."
        : capability === "jobs.schedule"
          ? "This plugin's scheduled/queued jobs will stop executing (fail-closed)."
          : "Actions requiring this capability will be refused (fail-closed).";
    if (!confirm(`Revoke '${capability}'?\n\n${impact}`)) return;
    setBusy(true);
    try {
      const res = await revokeCap({ pluginId, capability });
      if (res.error) {
        toast.error(String((res.error as Error).message).replace("[GraphQL] ", ""));
        return;
      }
      toast.success(`Revoked ${capability}`);
      refreshGrants();
    } finally {
      setBusy(false);
    }
  }

  if (fetching && !plugin) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!plugin) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm font-medium">Plugin not found</p>
      </div>
    );
  }

  const tools = plugin.manifest?.tools ?? [];
  const jobs = plugin.manifest?.jobs ?? [];

  return (
    <PageLayout maxWidth="wide">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Plugins", href: "/plugins" },
          { label: plugin.displayName },
        ]}
      />

      <Card padding="lg" className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-foreground">{plugin.displayName}</h1>
              <Badge variant="gray">{plugin.category}</Badge>
              <Badge variant={STATUS_VARIANT[plugin.status] ?? "gray"}>{plugin.status}</Badge>
              <span className="text-xs text-muted-foreground">v{plugin.version}</span>
            </div>
            {plugin.description && (
              <p className="mt-1 text-sm text-muted-foreground">{plugin.description}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant={plugin.enabled ? "secondary" : "primary"}
              size="sm"
              disabled={busy}
              onClick={() =>
                run(
                  () => setEnabled({ pluginId, enabled: !plugin.enabled }),
                  plugin.enabled ? "Disabled" : "Enabled",
                )
              }
            >
              {plugin.enabled ? "Disable" : "Enable"}
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 className="h-4 w-4" />}
              disabled={busy}
              onClick={remove}
            >
              Uninstall
            </Button>
          </div>
        </div>

        {plugin.status === "error" && (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive">
            <span className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              {plugin.lastError ?? "This plugin reported an error."}
            </span>
            <Button
              size="xs"
              variant="secondary"
              disabled={busy}
              onClick={() => run(() => clearError({ pluginId }), "Error cleared")}
            >
              Clear
            </Button>
          </div>
        )}
      </Card>

      {/* Config — rendered from the manifest's configSchema via the shared JsonSchemaForm primitive
          (validation + secret masking), replacing the hand-rolled field rendering. */}
      {fields.length > 0 && (
        <Card padding="lg" className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Configuration</h2>
          <JsonSchemaForm
            schema={plugin.manifest?.configSchema}
            value={config}
            onChange={setLocalConfig}
          />
          <div className="flex justify-end border-t border-border pt-3">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => run(() => setConfig({ pluginId, config }), "Configuration saved")}
            >
              Save configuration
            </Button>
          </div>
        </Card>
      )}

      {/* Capabilities + runtime grants. A declared capability grants NOTHING until an admin grants it
          here — the execution runtime is fail-closed. */}
      <Card padding="lg" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Capabilities</h2>
          {runtimeEnabled ? (
            <Tooltip content="The plugin runtime is fail-closed: a declared capability is refused at runtime until it is granted below.">
              <Badge variant="green">runtime enforced</Badge>
            </Tooltip>
          ) : (
            <Tooltip content="Enable the PLUGIN_RUNTIME feature to grant capabilities. Until then, declared capabilities are inert metadata.">
              <Badge variant="gray">runtime disabled</Badge>
            </Tooltip>
          )}
        </div>
        {plugin.capabilities.length === 0 ? (
          <p className="text-sm text-muted-foreground">None declared.</p>
        ) : (
          <ul className="divide-y divide-border">
            {plugin.capabilities.map((c) => {
              const granted = grantedSet.has(c);
              return (
                <li key={c} className="flex items-center justify-between gap-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Tooltip content={capabilityHint(c)}>
                      <code className="text-xs text-foreground">{c}</code>
                    </Tooltip>
                    <Badge variant={granted ? "green" : "gray"}>
                      {granted ? "granted" : "not granted"}
                    </Badge>
                  </div>
                  {runtimeEnabled && (
                    <div className="flex-shrink-0">
                      {granted ? (
                        <Button
                          size="xs"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => revoke(c)}
                        >
                          Revoke
                        </Button>
                      ) : (
                        <Button
                          size="xs"
                          variant="primary"
                          disabled={busy}
                          onClick={() => grant(c)}
                        >
                          Grant
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Tools + Jobs */}
      {(tools.length > 0 || jobs.length > 0) && (
        <Card padding="lg" className="space-y-3">
          {tools.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-foreground">Tools</h2>
              <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                {tools.map((t) => (
                  <li key={t.name}>
                    <span className="font-medium text-foreground">{t.displayName}</span> —{" "}
                    {t.description}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {jobs.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-foreground">Scheduled jobs</h2>
              <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                {jobs.map((j) => (
                  <li key={j.jobKey}>
                    <span className="font-medium text-foreground">{j.displayName}</span>
                    {j.schedule ? ` · ${j.schedule}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </PageLayout>
  );
}
