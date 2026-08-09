"use client";

import { useMutation } from "urql";
import { CREATE_SMOKE_CASE } from "@/lib/graphql/mutations";
import { Input, Select, FormField, FormDialog } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

interface SmokeCaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/** Create a tool smoke-case. Self-contained: owns its mutation + form; parent only controls `open`. */
export function SmokeCaseDialog({ open, onOpenChange, onSaved }: SmokeCaseDialogProps) {
  const [, create] = useMutation(CREATE_SMOKE_CASE);
  const f = useResourceForm({
    open,
    onOpenChange,
    empty: { name: "", toolName: "", expectDecision: "allow" },
    submit: async (v) => {
      if (!v.name.trim() || !v.toolName.trim()) return "Name and tool name are required";
      const r = await create(v);
      return r.error?.graphQLErrors?.[0]?.message ?? r.error?.message ?? null;
    },
    onDone: onSaved,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New smoke case"
      description="Assert how a tool call should be admitted; running it drives the real gateway."
      onSubmit={f.onSubmit}
      submitLabel="Add case"
      busy={f.busy}
      error={f.error}
      submitDisabled={!f.values.name.trim() || !f.values.toolName.trim()}
    >
      <FormField label="Case name">
        <Input
          placeholder="e.g. Block shell in prod"
          value={f.values.name}
          onChange={(e) => f.set("name", e.target.value)}
        />
      </FormField>
      <FormField label="Tool name">
        <Input
          placeholder="e.g. shell"
          value={f.values.toolName}
          onChange={(e) => f.set("toolName", e.target.value)}
        />
      </FormField>
      <FormField label="Expected decision">
        <Select
          value={f.values.expectDecision}
          onChange={(e) => f.set("expectDecision", e.target.value)}
        >
          <option value="allow">Expect allow</option>
          <option value="deny">Expect deny</option>
        </Select>
      </FormField>
    </FormDialog>
  );
}
