"use client";

import { useMutation } from "urql";
import { CREATE_LABEL } from "@/lib/graphql/mutations";
import { Input, FormField, FormDialog } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

interface LabelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/** Create a label in the workspace label catalog. */
export function LabelDialog({ open, onOpenChange, onSaved }: LabelDialogProps) {
  const [, createLabel] = useMutation(CREATE_LABEL);
  const f = useResourceForm({
    open,
    onOpenChange,
    empty: { name: "", color: "#6366f1" },
    submit: async (v) => {
      if (!v.name.trim()) return "Label name is required";
      const res = await createLabel({ name: v.name.trim(), color: v.color });
      return res.error?.graphQLErrors?.[0]?.message ?? res.error?.message ?? null;
    },
    onDone: onSaved,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New label"
      onSubmit={f.onSubmit}
      submitLabel="Add label"
      busy={f.busy}
      error={f.error}
      submitDisabled={!f.values.name.trim()}
    >
      <FormField label="Name">
        <Input placeholder="e.g. urgent" value={f.values.name} onChange={(e) => f.set("name", e.target.value)} />
      </FormField>
      <FormField label="Color">
        <input
          type="color"
          className="h-9 w-16 rounded-md border border-input bg-background"
          value={f.values.color}
          onChange={(e) => f.set("color", e.target.value)}
        />
      </FormField>
    </FormDialog>
  );
}
