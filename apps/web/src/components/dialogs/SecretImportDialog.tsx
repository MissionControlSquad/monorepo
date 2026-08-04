"use client";

import { useMutation } from "urql";
import { IMPORT_SECRETS } from "@/lib/graphql/mutations";
import { Textarea, Checkbox, FormField, FormDialog } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

interface SecretImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with a human-readable summary once the import succeeds. */
  onImported?: (summary: string) => void;
  onSaved?: () => void;
}

/** Bulk-import secrets from pasted KEY=VALUE (.env) lines. */
export function SecretImportDialog({ open, onOpenChange, onImported, onSaved }: SecretImportDialogProps) {
  const [, importSecrets] = useMutation(IMPORT_SECRETS);
  const f = useResourceForm({
    open,
    onOpenChange,
    empty: { text: "", overwrite: false },
    submit: async (v) => {
      if (!v.text.trim()) return "Paste some KEY=VALUE lines to import";
      const res = await importSecrets({ text: v.text, overwrite: v.overwrite });
      if (res.error) return res.error.graphQLErrors?.[0]?.message ?? res.error.message ?? "Failed to import";
      const s = res.data?.importSecrets;
      if (s) {
        onImported?.(
          `Imported: ${s.created} created, ${s.rotated} rotated, ${s.skipped} skipped` +
            (s.invalidLines ? `, ${s.invalidLines} invalid line(s) ignored` : ""),
        );
      }
      return null;
    },
    onDone: onSaved,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Bulk import secrets"
      description="Paste a .env (KEY=VALUE lines). Values are encrypted on the way in."
      onSubmit={f.onSubmit}
      submitLabel="Import"
      busy={f.busy}
      error={f.error}
      submitDisabled={!f.values.text.trim()}
    >
      <FormField label="KEY=VALUE lines">
        <Textarea
          className="h-40 font-mono text-xs"
          placeholder={"# paste a .env\nOPENAI_API_KEY=sk-...\nSTRIPE_KEY=sk_live_..."}
          value={f.values.text}
          onChange={(e) => f.set("text", e.target.value)}
        />
      </FormField>
      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Checkbox checked={f.values.overwrite} onChange={(e) => f.set("overwrite", e.target.checked)} />
        Overwrite existing (rotate)
      </label>
    </FormDialog>
  );
}
