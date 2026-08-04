"use client";

import { useMutation } from "urql";
import { QUEUE_AGENT_COMMAND } from "@/lib/graphql/mutations";
import { Input, FormField, FormDialog } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

interface AgentLite {
  id: string;
  name: string;
  identityEmoji: string | null;
}

interface RunnerQueueCommandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: AgentLite[];
  /** Shared agent selection with the page (runtime + sandbox sections use the same agent). */
  agentId: string;
  onAgentChange: (agentId: string) => void;
  onSaved?: () => void;
}

/** Queue a command an agent's runner daemon pulls on its next poll. */
export function RunnerQueueCommandDialog({
  open,
  onOpenChange,
  agents,
  agentId,
  onAgentChange,
  onSaved,
}: RunnerQueueCommandDialogProps) {
  const [, queueAgent] = useMutation(QUEUE_AGENT_COMMAND);
  const f = useResourceForm({
    open,
    onOpenChange,
    empty: { command: "" },
    submit: async (v) => {
      if (!agentId) return "Pick an agent";
      if (!v.command.trim()) return "Command is required";
      const res = await queueAgent({ agentId, command: v.command.trim() });
      return res.error?.graphQLErrors?.[0]?.message ?? res.error?.message ?? null;
    },
    onDone: onSaved,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Queue a runner command"
      description="The agent's runner daemon pulls this on its next poll."
      onSubmit={f.onSubmit}
      submitLabel="Queue"
      busy={f.busy}
      error={f.error}
      submitDisabled={!agentId || !f.values.command.trim()}
    >
      <FormField label="Agent">
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={agentId}
          onChange={(e) => onAgentChange(e.target.value)}
        >
          <option value="">Select agent…</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.identityEmoji ? `${a.identityEmoji} ` : ""}
              {a.name}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Command">
        <Input
          className="font-mono"
          placeholder="e.g. git pull && npm test"
          value={f.values.command}
          onChange={(e) => f.set("command", e.target.value)}
        />
      </FormField>
    </FormDialog>
  );
}
