"use client";

import { useMutation } from "urql";
import { INSTALL_PLUGIN } from "@/lib/graphql/mutations";
import { Button, FormField, FormDialog } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

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

interface PluginInstallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/** Install a plugin by pasting its manifest JSON. */
export function PluginInstallDialog({ open, onOpenChange, onSaved }: PluginInstallDialogProps) {
  const [, install] = useMutation(INSTALL_PLUGIN);
  const f = useResourceForm({
    open,
    onOpenChange,
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
    onDone: onSaved,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Install plugin"
      description="Paste a plugin manifest JSON. Declared capabilities are recorded for review."
      onSubmit={f.onSubmit}
      submitLabel="Install plugin"
      busy={f.busy}
      error={f.error}
      submitDisabled={!f.values.manifest.trim()}
    >
      <FormField label="Manifest JSON">
        <textarea
          className="h-56 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
          placeholder="Paste a plugin manifest JSON…"
          value={f.values.manifest}
          onChange={(e) => f.set("manifest", e.target.value)}
        />
      </FormField>
      <Button type="button" size="sm" variant="ghost" onClick={() => f.set("manifest", SAMPLE)}>
        Load sample
      </Button>
    </FormDialog>
  );
}
