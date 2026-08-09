"use client";

import { useMutation } from "urql";
import { IMPORT_WORKSPACE_BUNDLE } from "@/lib/graphql/mutations";
import { COLLISION_STRATEGIES } from "@agentcenter/utils";
import { Select, Textarea, FormField, FormDialog } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

interface ImportSummary {
  createdAgents: number;
  skippedAgents: number;
  createdProjects: number;
  skippedProjects: number;
  createdSkills: number;
  skippedSkills: number;
}

interface PortabilityImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: (summary: ImportSummary | null) => void;
}

/** Import a workspace bundle (paste JSON) with a collision strategy. */
export function PortabilityImportDialog({ open, onOpenChange, onImported }: PortabilityImportDialogProps) {
  const [, importBundle] = useMutation(IMPORT_WORKSPACE_BUNDLE);
  const f = useResourceForm({
    open,
    onOpenChange,
    empty: { strategy: "rename", pasted: "" },
    submit: async (v) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(v.pasted);
      } catch {
        return "Pasted text is not valid JSON";
      }
      const res = await importBundle({ bundle: parsed, collisionStrategy: v.strategy });
      if (res.error) return res.error.graphQLErrors?.[0]?.message ?? "Import failed";
      onImported?.(res.data?.importWorkspaceBundle?.summary ?? null);
      return null;
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Import workspace bundle"
      description="Provisions agents / projects / skills from a bundle. Admin only; never contains secrets."
      onSubmit={f.onSubmit}
      submitLabel="Import bundle"
      busy={f.busy}
      error={f.error}
      submitDisabled={!f.values.pasted.trim()}
    >
      <FormField label="On collision">
        <Select
          value={f.values.strategy}
          onChange={(e) => f.set("strategy", e.target.value)}
        >
          {COLLISION_STRATEGIES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
      </FormField>
      <FormField label="Bundle JSON">
        <Textarea
          className="h-48 font-mono text-xs"
          placeholder="Paste a workspace bundle JSON here…"
          value={f.values.pasted}
          onChange={(e) => f.set("pasted", e.target.value)}
        />
      </FormField>
    </FormDialog>
  );
}
