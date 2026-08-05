"use client";

import { useMutation } from "urql";
import { REGISTER_LOCAL_SERVICE } from "@/lib/graphql/mutations";
import { Input, FormField, FormDialog } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

interface LocalServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/** Register a supervised local_stdio service. */
export function LocalServiceDialog({ open, onOpenChange, onSaved }: LocalServiceDialogProps) {
  const [, register] = useMutation(REGISTER_LOCAL_SERVICE);
  const f = useResourceForm({
    open,
    onOpenChange,
    empty: { key: "", command: "" },
    submit: async (v) => {
      if (!v.key.trim()) return "Key is required";
      const r = await register(v);
      return r.error?.message ?? null;
    },
    onDone: onSaved,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Register local service"
      description="Register a local_stdio service so the supervisor watches it."
      onSubmit={f.onSubmit}
      submitLabel="Register"
      busy={f.busy}
      error={f.error}
      submitDisabled={!f.values.key.trim()}
    >
      <FormField label="Key">
        <Input placeholder="e.g. mcp:filesystem" value={f.values.key} onChange={(e) => f.set("key", e.target.value)} />
      </FormField>
      <FormField label="Launch command">
        <Input
          placeholder="e.g. npx @modelcontextprotocol/server-filesystem"
          value={f.values.command}
          onChange={(e) => f.set("command", e.target.value)}
        />
      </FormField>
    </FormDialog>
  );
}
