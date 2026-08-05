"use client";

import { useMutation } from "urql";
import { CREATE_SKILL } from "@/lib/graphql/mutations";
import { Input, FormField, FormDialog, Textarea } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

const EMPTY_MARKDOWN = "# Skill\n\nDescribe what the agent should do.";

interface SkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/** Create a reusable skill (markdown capability module). */
export function SkillDialog({ open, onOpenChange, onSaved }: SkillDialogProps) {
  const [, createSkill] = useMutation(CREATE_SKILL);
  const f = useResourceForm({
    open,
    onOpenChange,
    empty: { name: "", icon: "", tagline: "", markdown: EMPTY_MARKDOWN },
    submit: async (v) => {
      if (!v.name.trim()) return "Name is required";
      const res = await createSkill({
        name: v.name.trim(),
        markdown: v.markdown,
        icon: v.icon.trim() || null,
        tagline: v.tagline.trim() || null,
      });
      return res.error?.graphQLErrors?.[0]?.message ?? res.error?.message ?? null;
    },
    onDone: onSaved,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New skill"
      onSubmit={f.onSubmit}
      submitLabel="Create skill"
      busy={f.busy}
      error={f.error}
      submitDisabled={!f.values.name.trim()}
    >
      <div className="grid grid-cols-[5rem_1fr] gap-4">
        <FormField label="Icon">
          <Input placeholder="🧩" className="text-center" value={f.values.icon} onChange={(e) => f.set("icon", e.target.value)} />
        </FormField>
        <FormField label="Name">
          <Input placeholder="Skill name" value={f.values.name} onChange={(e) => f.set("name", e.target.value)} />
        </FormField>
      </div>
      <FormField label="Tagline (optional)">
        <Input value={f.values.tagline} onChange={(e) => f.set("tagline", e.target.value)} />
      </FormField>
      <FormField label="Markdown">
        <Textarea className="h-40 font-mono text-xs"
          value={f.values.markdown}
          onChange={(e) => f.set("markdown", e.target.value)}
        />
      </FormField>
    </FormDialog>
  );
}
