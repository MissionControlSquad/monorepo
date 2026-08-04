"use client";

import { useMutation } from "urql";
import { CREATE_SECRET_PROVIDER } from "@/lib/graphql/mutations";
import { Input, FormField, FormDialog } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

const PROVIDER_KINDS = ["env", "aws", "vault"];

interface SecretProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/** Add a secret provider (external backend or the local envelope). */
export function SecretProviderDialog({ open, onOpenChange, onSaved }: SecretProviderDialogProps) {
  const [, createProvider] = useMutation(CREATE_SECRET_PROVIDER);
  const f = useResourceForm({
    open,
    onOpenChange,
    empty: { name: "", kind: "env" },
    submit: async (v) => {
      if (!v.name.trim()) return "Provider name is required";
      const res = await createProvider({ name: v.name.trim(), kind: v.kind });
      return res.error?.graphQLErrors?.[0]?.message ?? res.error?.message ?? null;
    },
    onDone: onSaved,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add secret provider"
      description="Point the vault at an external backend (aws/vault) or the local envelope."
      onSubmit={f.onSubmit}
      submitLabel="Add provider"
      busy={f.busy}
      error={f.error}
      submitDisabled={!f.values.name.trim()}
    >
      <FormField label="Name">
        <Input placeholder="e.g. prod-vault" value={f.values.name} onChange={(e) => f.set("name", e.target.value)} />
      </FormField>
      <FormField label="Kind">
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={f.values.kind}
          onChange={(e) => f.set("kind", e.target.value)}
        >
          {PROVIDER_KINDS.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
      </FormField>
    </FormDialog>
  );
}
