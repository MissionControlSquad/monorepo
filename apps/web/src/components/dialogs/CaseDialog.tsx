"use client";

import { useMutation } from "urql";
import { CREATE_CASE } from "@/lib/graphql/mutations";
import { Input, FormField, FormDialog } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

interface CaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/** Open a new case (support ticket / work item). */
export function CaseDialog({ open, onOpenChange, onSaved }: CaseDialogProps) {
  const [, createCase] = useMutation(CREATE_CASE);
  const f = useResourceForm({
    open,
    onOpenChange,
    empty: { title: "", caseType: "bug" },
    submit: async (v) => {
      if (!v.title.trim()) return "Title is required";
      const res = await createCase({ title: v.title.trim(), caseType: v.caseType.trim() || "bug" });
      return res.error?.graphQLErrors?.[0]?.message ?? res.error?.message ?? null;
    },
    onDone: onSaved,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Open a case"
      onSubmit={f.onSubmit}
      submitLabel="Open case"
      busy={f.busy}
      error={f.error}
      submitDisabled={!f.values.title.trim()}
    >
      <FormField label="Title">
        <Input placeholder="Short summary" value={f.values.title} onChange={(e) => f.set("title", e.target.value)} />
      </FormField>
      <FormField label="Type">
        <Input
          placeholder="e.g. bug, feature, incident"
          value={f.values.caseType}
          onChange={(e) => f.set("caseType", e.target.value)}
        />
      </FormField>
    </FormDialog>
  );
}
