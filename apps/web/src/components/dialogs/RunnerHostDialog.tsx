"use client";

import { useMutation } from "urql";
import { CREATE_RUNNER_HOST } from "@/lib/graphql/mutations";
import { Input, Textarea, FormField, FormDialog } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

interface RunnerHostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/** Register a BYO server for direct-SSH command execution. */
export function RunnerHostDialog({ open, onOpenChange, onSaved }: RunnerHostDialogProps) {
  const [, createHost] = useMutation(CREATE_RUNNER_HOST);
  const f = useResourceForm({
    open,
    onOpenChange,
    empty: { name: "", host: "", port: "22", username: "root", key: "" },
    submit: async (v) => {
      if (!v.name.trim() || !v.host.trim() || !v.key.trim())
        return "name, host and private key are required";
      const res = await createHost({
        name: v.name.trim(),
        host: v.host.trim(),
        port: Number(v.port) || 22,
        username: v.username.trim() || "root",
        privateKey: v.key,
      });
      return res.error?.graphQLErrors?.[0]?.message ?? res.error?.message ?? null;
    },
    onDone: onSaved,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add BYO server"
      description="Run commands on your own server over SSH. The private key is stored encrypted, never shown again."
      onSubmit={f.onSubmit}
      submitLabel="Add host"
      busy={f.busy}
      error={f.error}
      submitDisabled={!f.values.name.trim() || !f.values.host.trim() || !f.values.key.trim()}
    >
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Name">
          <Input value={f.values.name} onChange={(e) => f.set("name", e.target.value)} />
        </FormField>
        <FormField label="Host or IP">
          <Input className="font-mono" value={f.values.host} onChange={(e) => f.set("host", e.target.value)} />
        </FormField>
        <FormField label="Port">
          <Input value={f.values.port} onChange={(e) => f.set("port", e.target.value)} />
        </FormField>
        <FormField label="Username">
          <Input value={f.values.username} onChange={(e) => f.set("username", e.target.value)} />
        </FormField>
      </div>
      <FormField label="SSH private key (PEM)">
        <Textarea
          className="h-28 font-mono text-xs"
          placeholder="Stored encrypted, never shown again"
          value={f.values.key}
          onChange={(e) => f.set("key", e.target.value)}
        />
      </FormField>
    </FormDialog>
  );
}
