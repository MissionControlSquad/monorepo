"use client";

import { useQuery, useMutation } from "urql";
import { ENVIRONMENT_CAPABILITIES_QUERY } from "@/lib/graphql/queries";
import { CREATE_ENVIRONMENT } from "@/lib/graphql/mutations";
import { Input, Select, FormField, FormDialog } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

const DRIVER_HELP: Record<string, string> = {
  local: "Runs on the control-plane host. Not for untrusted/low-trust agents.",
  ssh: "Runs on a reachable server over SSH (host + key from the vault).",
  sandbox: "Provisions an isolated sandbox per run (pick a provider below).",
  plugin: "Delegates to a registered environment plugin.",
};

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

interface EnvironmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/** Create an execution environment. Self-contained: queries driver/provider capabilities. */
export function EnvironmentDialog({ open, onOpenChange, onSaved }: EnvironmentDialogProps) {
  const [{ data }] = useQuery<{ environmentCapabilities: Capabilities }>({
    query: ENVIRONMENT_CAPABILITIES_QUERY,
    pause: !open,
  });
  const caps = data?.environmentCapabilities;
  const drivers = caps?.drivers ?? ["local", "ssh", "sandbox", "plugin"];
  const providers = caps?.sandboxProviders ?? [];
  const [, createEnv] = useMutation(CREATE_ENVIRONMENT);

  const f = useResourceForm({
    open,
    onOpenChange,
    empty: {
      name: "",
      driver: "local",
      description: "",
      leasePolicy: "ephemeral",
      provider: "",
      host: "",
      username: "root",
      keySecret: "",
    },
    submit: async (v) => {
      if (!v.name.trim()) return "Name is required";
      if (v.driver === "sandbox" && !v.provider) return "Pick a sandbox provider";
      if (v.driver === "ssh" && !v.host.trim()) return "SSH host is required";
      const config: Record<string, unknown> =
        v.driver === "sandbox"
          ? { provider: v.provider }
          : v.driver === "ssh"
            ? (() => {
                const cfg: Record<string, unknown> = { host: v.host.trim() };
                if (v.username.trim()) cfg.username = v.username.trim();
                if (v.keySecret.trim()) cfg.privateKey = { secretRef: { name: v.keySecret.trim() } };
                return cfg;
              })()
            : {};
      const res = await createEnv({
        name: v.name.trim(),
        driver: v.driver,
        description: v.description.trim() || null,
        config,
        metadata: v.leasePolicy !== "ephemeral" ? { leasePolicy: v.leasePolicy } : undefined,
      });
      return res.error?.graphQLErrors?.[0]?.message ?? res.error?.message ?? null;
    },
    onDone: onSaved,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New environment"
      onSubmit={f.onSubmit}
      submitLabel="Create environment"
      busy={f.busy}
      error={f.error}
      submitDisabled={!f.values.name.trim()}
    >
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Name">
          <Input placeholder="e.g. staging-box" value={f.values.name} onChange={(e) => f.set("name", e.target.value)} />
        </FormField>
        <FormField label="Driver">
          <Select
            value={f.values.driver}
            onChange={(e) => f.set("driver", e.target.value)}
          >
            {drivers.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </Select>
        </FormField>
      </div>
      <p className="text-xs text-muted-foreground">{DRIVER_HELP[f.values.driver]}</p>

      {(f.values.driver === "sandbox" || f.values.driver === "local") && (
        <FormField label="Machine reuse">
          <Select
            value={f.values.leasePolicy}
            onChange={(e) => f.set("leasePolicy", e.target.value)}
          >
            <option value="ephemeral">ephemeral (fresh box each run)</option>
            <option value="reuse_by_environment">reuse (keep the box between runs)</option>
            <option value="retain_on_failure">retain on failure (keep only failed boxes)</option>
          </Select>
        </FormField>
      )}

      {f.values.driver === "sandbox" && (
        <FormField label="Provider">
          <Select
            value={f.values.provider}
            onChange={(e) => f.set("provider", e.target.value)}
          >
            <option value="">— pick a provider —</option>
            {providers.map((p) => (
              <option key={p.key} value={p.key}>
                {p.displayName} {p.isolating ? "(isolated)" : "(on host)"}
              </option>
            ))}
          </Select>
        </FormField>
      )}

      {f.values.driver === "ssh" && (
        <div className="grid grid-cols-[1fr_6rem] gap-4">
          <FormField label="Host or IP">
            <Input className="font-mono" value={f.values.host} onChange={(e) => f.set("host", e.target.value)} />
          </FormField>
          <FormField label="User">
            <Input className="font-mono" value={f.values.username} onChange={(e) => f.set("username", e.target.value)} />
          </FormField>
          <div className="col-span-2">
            <FormField label="Private-key vault secret name">
              <Input className="font-mono" value={f.values.keySecret} onChange={(e) => f.set("keySecret", e.target.value)} />
            </FormField>
          </div>
        </div>
      )}

      <FormField label="Description (optional)">
        <Input value={f.values.description} onChange={(e) => f.set("description", e.target.value)} />
      </FormField>
    </FormDialog>
  );
}
