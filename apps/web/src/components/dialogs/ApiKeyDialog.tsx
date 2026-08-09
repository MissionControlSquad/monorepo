"use client";

import { useMutation } from "urql";
import { MINT_API_KEY } from "@/lib/graphql/mutations";
import { Input, FormField, FormDialog } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

interface ApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  /** Called with the minted key's plaintext (shown exactly once). */
  onMinted?: (revealed: { name: string; plainKey: string }) => void;
}

/** Mint a workspace API key. The plaintext is surfaced once via onMinted. */
export function ApiKeyDialog({ open, onOpenChange, onSaved, onMinted }: ApiKeyDialogProps) {
  const [, mint] = useMutation(MINT_API_KEY);
  const f = useResourceForm({
    open,
    onOpenChange,
    empty: { name: "", expiresAt: "" },
    submit: async (v) => {
      if (!v.name.trim()) return "Name is required";
      const res = await mint({
        name: v.name.trim(),
        expiresAt: v.expiresAt ? new Date(v.expiresAt).toISOString() : null,
      });
      if (res.error) return res.error.graphQLErrors?.[0]?.message ?? "Mint failed";
      onMinted?.({ name: v.name.trim(), plainKey: res.data.mintApiKey.plainKey });
      return null;
    },
    onDone: onSaved,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Mint API key"
      description="Shown once at creation — copy it before closing."
      onSubmit={f.onSubmit}
      submitLabel="Mint key"
      busy={f.busy}
      error={f.error}
      submitDisabled={!f.values.name.trim()}
    >
      <FormField label="Name">
        <Input placeholder="e.g. ci-deploy" value={f.values.name} onChange={(e) => f.set("name", e.target.value)} />
      </FormField>
      <FormField label="Expires (optional)">
        <Input type="date" value={f.values.expiresAt} onChange={(e) => f.set("expiresAt", e.target.value)} />
      </FormField>
    </FormDialog>
  );
}
