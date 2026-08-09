"use client";

import { useMutation } from "urql";
import { CREATE_TEAM } from "@/lib/graphql/mutations";
import { Input, FormField, FormDialog } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

interface TeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/** Create a team (installable bundle of agent roles). */
export function TeamDialog({ open, onOpenChange, onSaved }: TeamDialogProps) {
  const [, createTeam] = useMutation(CREATE_TEAM);
  const f = useResourceForm({
    open,
    onOpenChange,
    empty: { name: "", icon: "", tagline: "", tags: "" },
    submit: async (v) => {
      if (!v.name.trim()) return "Team name is required";
      const r = await createTeam({
        name: v.name.trim(),
        icon: v.icon.trim() || null,
        tagline: v.tagline.trim() || null,
        tags: v.tags.split(",").map((s) => s.trim()).filter(Boolean),
      });
      return r.error?.graphQLErrors?.[0]?.message ?? r.error?.message ?? null;
    },
    onDone: onSaved,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New team"
      onSubmit={f.onSubmit}
      submitLabel="Create team"
      busy={f.busy}
      error={f.error}
      submitDisabled={!f.values.name.trim()}
    >
      <div className="grid grid-cols-[4rem_1fr] gap-4">
        <FormField label="Icon">
          <Input placeholder="👥" value={f.values.icon} onChange={(e) => f.set("icon", e.target.value)} />
        </FormField>
        <FormField label="Name">
          <Input placeholder="e.g. Growth Squad" value={f.values.name} onChange={(e) => f.set("name", e.target.value)} />
        </FormField>
      </div>
      <FormField label="Tagline (optional)">
        <Input value={f.values.tagline} onChange={(e) => f.set("tagline", e.target.value)} />
      </FormField>
      <FormField label="Tags (comma-separated, optional)">
        <Input placeholder="growth, marketing" value={f.values.tags} onChange={(e) => f.set("tags", e.target.value)} />
      </FormField>
    </FormDialog>
  );
}
