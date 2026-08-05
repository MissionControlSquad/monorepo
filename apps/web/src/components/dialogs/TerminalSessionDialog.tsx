"use client";

import { useMutation } from "urql";
import { OPEN_TERMINAL_SESSION } from "@/lib/graphql/mutations";
import { Input, FormField, FormDialog } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

interface TerminalSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the freshly-minted session (id + host + one-time connect token). */
  onOpened?: (session: { id: string; host: string | null; token: string }) => void;
}

/** Authorize an SSH terminal session; a one-time connect token is minted. */
export function TerminalSessionDialog({ open, onOpenChange, onOpened }: TerminalSessionDialogProps) {
  const [, openSession] = useMutation(OPEN_TERMINAL_SESSION);
  const f = useResourceForm({
    open,
    onOpenChange,
    empty: { command: "", cwd: "", label: "" },
    submit: async (v) => {
      if (!v.command.trim()) return "An ssh command is required";
      const res = await openSession({
        command: v.command.trim(),
        cwd: v.cwd.trim() || null,
        label: v.label.trim() || null,
      });
      if (res.error) return res.error.graphQLErrors?.[0]?.message ?? "Open failed";
      const s = res.data.openTerminalSession;
      onOpened?.({ id: s.id, host: s.host, token: s.connectToken });
      return null;
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Open terminal session"
      description="Authorize an SSH session; a one-time connect token is minted."
      onSubmit={f.onSubmit}
      submitLabel="Open session"
      busy={f.busy}
      error={f.error}
      submitDisabled={!f.values.command.trim()}
    >
      <FormField label="SSH command">
        <Input
          className="font-mono"
          placeholder="ssh user@host  |  ssh -p 2222 user@host"
          value={f.values.command}
          onChange={(e) => f.set("command", e.target.value)}
        />
      </FormField>
      <FormField label="Working directory (optional)">
        <Input value={f.values.cwd} onChange={(e) => f.set("cwd", e.target.value)} />
      </FormField>
      <FormField label="Label (optional)">
        <Input value={f.values.label} onChange={(e) => f.set("label", e.target.value)} />
      </FormField>
    </FormDialog>
  );
}
