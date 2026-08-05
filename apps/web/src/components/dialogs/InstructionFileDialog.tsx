"use client";

import { useMutation } from "urql";
import { UPSERT_AGENT_INSTRUCTION } from "@/lib/graphql/mutations";
import { Input, FormField, FormDialog } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

interface InstructionFileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  /** Called with the new file name once created, so the parent can select it. */
  onCreated?: (fileName: string) => void;
  onSaved?: () => void;
}

/** Add a markdown instruction file (AGENTS.md-style) to an agent's bundle. */
export function InstructionFileDialog({
  open,
  onOpenChange,
  agentId,
  onCreated,
  onSaved,
}: InstructionFileDialogProps) {
  const [, upsert] = useMutation(UPSERT_AGENT_INSTRUCTION);
  const f = useResourceForm({
    open,
    onOpenChange,
    empty: { fileName: "" },
    submit: async (v) => {
      const name = v.fileName.trim();
      if (!name) return "File name is required";
      const res = await upsert({ agentId, fileName: name, content: `# ${name}\n\n` });
      if (res.error) return res.error.graphQLErrors?.[0]?.message ?? "Invalid file name";
      onCreated?.(name);
      return null;
    },
    onDone: onSaved,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add instruction file"
      onSubmit={f.onSubmit}
      submitLabel="Add file"
      busy={f.busy}
      error={f.error}
      submitDisabled={!f.values.fileName.trim()}
    >
      <FormField label="File name">
        <Input
          className="font-mono"
          placeholder="NEW.md"
          value={f.values.fileName}
          onChange={(e) => f.set("fileName", e.target.value)}
        />
      </FormField>
    </FormDialog>
  );
}
