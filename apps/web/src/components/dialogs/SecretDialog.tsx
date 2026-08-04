"use client";

import { useQuery, useMutation } from "urql";
import { SECRET_PROVIDERS_QUERY } from "@/lib/graphql/queries";
import { CREATE_SECRET, CREATE_USER_SECRET } from "@/lib/graphql/mutations";
import { Input, FormField, FormDialog } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

interface SecretDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/** Create a workspace or personal secret. Self-contained: queries providers for the picker. */
export function SecretDialog({ open, onOpenChange, onSaved }: SecretDialogProps) {
  const [{ data }] = useQuery<{ secretProviders: { id: string; name: string; kind: string }[] }>({
    query: SECRET_PROVIDERS_QUERY,
    pause: !open,
  });
  const providers = data?.secretProviders ?? [];
  const [, createSecret] = useMutation(CREATE_SECRET);
  const [, createUserSecret] = useMutation(CREATE_USER_SECRET);

  const f = useResourceForm({
    open,
    onOpenChange,
    empty: { name: "", value: "", description: "", providerId: "", personal: false },
    submit: async (v) => {
      if (!v.name.trim()) return "Name is required";
      if (!v.value) return "Value is required";
      const res = v.personal
        ? await createUserSecret({
            name: v.name.trim(),
            value: v.value,
            description: v.description.trim() || null,
          })
        : await createSecret({
            name: v.name.trim(),
            value: v.value,
            description: v.description.trim() || null,
            providerId: v.providerId || null,
          });
      return res.error?.graphQLErrors?.[0]?.message ?? res.error?.message ?? null;
    },
    onDone: onSaved,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New secret"
      description="Encrypted at rest. The value is write-only — you can rotate it later but never read it back."
      onSubmit={f.onSubmit}
      submitLabel="Add secret"
      busy={f.busy}
      error={f.error}
      submitDisabled={!f.values.name.trim() || !f.values.value}
    >
      <FormField label="Name">
        <Input placeholder="e.g. OPENAI_API_KEY" value={f.values.name} onChange={(e) => f.set("name", e.target.value)} />
      </FormField>
      <FormField label="Value (write-only)">
        <Input type="password" value={f.values.value} onChange={(e) => f.set("value", e.target.value)} />
      </FormField>
      <FormField label="Description (optional)">
        <Input value={f.values.description} onChange={(e) => f.set("description", e.target.value)} />
      </FormField>
      <FormField label="Provider">
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={f.values.providerId}
          onChange={(e) => f.set("providerId", e.target.value)}
        >
          <option value="">Local envelope</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.kind})</option>
          ))}
        </select>
      </FormField>
      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <input type="checkbox" checked={f.values.personal} onChange={(e) => f.set("personal", e.target.checked)} />
        Personal (only you can see &amp; manage it)
      </label>
    </FormDialog>
  );
}
