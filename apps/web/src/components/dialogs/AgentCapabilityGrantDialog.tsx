"use client";

import { useMutation } from "urql";
import { AGENT_CAPABILITIES } from "@agentcenter/utils";
import { GRANT_AGENT_CAPABILITY } from "@/lib/graphql/mutations";
import { FormField, FormDialog } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

interface AgentCapabilityGrantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  /** Capabilities already granted to this agent (disabled in the picker). */
  grantedCaps: string[];
  onSaved?: () => void;
}

/** Grant a capability to an agent (enforced when the agent runs restricted). */
export function AgentCapabilityGrantDialog({
  open,
  onOpenChange,
  agentId,
  grantedCaps,
  onSaved,
}: AgentCapabilityGrantDialogProps) {
  const [, grant] = useMutation(GRANT_AGENT_CAPABILITY);
  const granted = new Set(grantedCaps);
  const f = useResourceForm({
    open,
    onOpenChange,
    empty: { cap: AGENT_CAPABILITIES[0] as string },
    submit: async (v) => {
      if (granted.has(v.cap)) return "That capability is already granted";
      const r = await grant({ agentId, capability: v.cap });
      return r.error?.graphQLErrors?.[0]?.message ?? r.error?.message ?? null;
    },
    onDone: onSaved,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Grant capability"
      description="Grants are enforced when the agent runs restricted."
      onSubmit={f.onSubmit}
      submitLabel="Grant"
      busy={f.busy}
      error={f.error}
    >
      <FormField label="Capability">
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={f.values.cap}
          onChange={(e) => f.set("cap", e.target.value)}
        >
          {AGENT_CAPABILITIES.map((c) => (
            <option key={c} value={c} disabled={granted.has(c)}>
              {c}
              {granted.has(c) ? " (granted)" : ""}
            </option>
          ))}
        </select>
      </FormField>
    </FormDialog>
  );
}
