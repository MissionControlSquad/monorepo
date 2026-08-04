"use client";

import { useMutation } from "urql";
import { ADD_TEAM_MEMBER } from "@/lib/graphql/mutations";
import { Input, FormField, FormDialog } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

interface TeamMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string | null;
  onSaved?: () => void;
}

/** Add a role to a team; installing the team creates one agent per role. */
export function TeamMemberDialog({ open, onOpenChange, teamId, onSaved }: TeamMemberDialogProps) {
  const [, addMember] = useMutation(ADD_TEAM_MEMBER);
  const f = useResourceForm({
    open,
    onOpenChange,
    empty: { name: "", role: "" },
    submit: async (v) => {
      if (!teamId) return "No team selected";
      if (!v.name.trim() || !v.role.trim()) return "Name and role are required";
      const r = await addMember({ teamId, name: v.name.trim(), role: v.role.trim() });
      return r.error?.graphQLErrors?.[0]?.message ?? r.error?.message ?? null;
    },
    onDone: onSaved,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add role"
      description="Add a role to the team; installing creates one agent for it."
      onSubmit={f.onSubmit}
      submitLabel="Add role"
      busy={f.busy}
      error={f.error}
      submitDisabled={!f.values.name.trim() || !f.values.role.trim()}
    >
      <FormField label="Member name">
        <Input value={f.values.name} onChange={(e) => f.set("name", e.target.value)} />
      </FormField>
      <FormField label="Role">
        <Input placeholder="e.g. Backend Developer" value={f.values.role} onChange={(e) => f.set("role", e.target.value)} />
      </FormField>
    </FormDialog>
  );
}
