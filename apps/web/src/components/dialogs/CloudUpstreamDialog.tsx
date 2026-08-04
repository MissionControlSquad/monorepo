"use client";

import { useMutation } from "urql";
import { UPSERT_CLOUD_UPSTREAM } from "@/lib/graphql/mutations";
import { Input, FormField, FormDialog } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

interface CloudUpstreamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/** Add/update a project's remote git upstream. */
export function CloudUpstreamDialog({ open, onOpenChange, onSaved }: CloudUpstreamDialogProps) {
  const [, upsert] = useMutation(UPSERT_CLOUD_UPSTREAM);
  const f = useResourceForm({
    open,
    onOpenChange,
    empty: { projectId: "", name: "origin", remoteUrl: "", remoteRef: "main" },
    submit: async (v) => {
      if (!v.projectId.trim() || !v.remoteUrl.trim()) return "Project ID and remote URL are required";
      const r = await upsert(v);
      return r.error?.message ?? null;
    },
    onDone: onSaved,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add upstream"
      description="Track a project's remote git fork and its drift state."
      onSubmit={f.onSubmit}
      submitLabel="Add upstream"
      busy={f.busy}
      error={f.error}
      submitDisabled={!f.values.projectId.trim() || !f.values.remoteUrl.trim()}
    >
      <FormField label="Project ID">
        <Input placeholder="proj_…" value={f.values.projectId} onChange={(e) => f.set("projectId", e.target.value)} />
      </FormField>
      <FormField label="Name">
        <Input placeholder="origin" value={f.values.name} onChange={(e) => f.set("name", e.target.value)} />
      </FormField>
      <FormField label="Remote URL">
        <Input placeholder="https://github.com/org/repo.git" value={f.values.remoteUrl} onChange={(e) => f.set("remoteUrl", e.target.value)} />
      </FormField>
      <FormField label="Ref">
        <Input placeholder="main" value={f.values.remoteRef} onChange={(e) => f.set("remoteRef", e.target.value)} />
      </FormField>
    </FormDialog>
  );
}
