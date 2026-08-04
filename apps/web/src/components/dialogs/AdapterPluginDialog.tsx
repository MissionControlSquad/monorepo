"use client";

import { useMutation } from "urql";
import { UPSERT_ADAPTER_PLUGIN } from "@/lib/graphql/mutations";
import { Input, Select, FormField, FormDialog } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

interface AdapterPluginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/** Add/update a declarative adapter plugin (base + argv template, no code exec). */
export function AdapterPluginDialog({ open, onOpenChange, onSaved }: AdapterPluginDialogProps) {
  const [, upsert] = useMutation(UPSERT_ADAPTER_PLUGIN);
  const f = useResourceForm({
    open,
    onOpenChange,
    empty: { key: "", base: "process", template: "" },
    submit: async (v) => {
      if (!v.key.trim() || !v.template.trim()) return "Key and template are required";
      const r = await upsert({
        key: v.key,
        base: v.base,
        template: v.template.split(/\s+/).filter(Boolean),
      });
      return r.error?.message ?? null;
    },
    onDone: onSaved,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add adapter plugin"
      description="A declarative runtime adapter — base + argv template, no code execution."
      onSubmit={f.onSubmit}
      submitLabel="Add adapter"
      busy={f.busy}
      error={f.error}
      submitDisabled={!f.values.key.trim() || !f.values.template.trim()}
    >
      <FormField label="Key">
        <Input placeholder="e.g. aider" value={f.values.key} onChange={(e) => f.set("key", e.target.value)} />
      </FormField>
      <FormField label="Base">
        <Select
          value={f.values.base}
          onChange={(e) => f.set("base", e.target.value)}
        >
          <option value="process">process</option>
          <option value="shell">shell</option>
          <option value="http">http</option>
        </Select>
      </FormField>
      <FormField label="Template">
        <Input
          placeholder="space-separated argv, use {prompt}"
          value={f.values.template}
          onChange={(e) => f.set("template", e.target.value)}
        />
      </FormField>
    </FormDialog>
  );
}
