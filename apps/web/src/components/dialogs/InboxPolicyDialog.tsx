"use client";

import { useMutation } from "urql";
import { SET_INBOX_POLICY } from "@/lib/graphql/mutations";
import { Input, FormField, FormDialog } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

const ITEM_KINDS = ["mention", "task_review", "clarification", "handoff", "approval"];
const ACTIONS = ["auto_handle", "route_to_human", "ignore"];

interface InboxPolicyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/** Create/replace an inbox routing rule (setInboxPolicy is an upsert keyed by itemKind+agent). */
export function InboxPolicyDialog({ open, onOpenChange, onSaved }: InboxPolicyDialogProps) {
  const [, set] = useMutation(SET_INBOX_POLICY);
  const f = useResourceForm({
    open,
    onOpenChange,
    empty: { itemKind: ITEM_KINDS[0], action: ACTIONS[0], priority: "0", agentId: "" },
    submit: async (v) => {
      const r = await set({
        itemKind: v.itemKind,
        action: v.action,
        priority: parseInt(v.priority, 10) || 0,
        agentId: v.agentId.trim() || null,
      });
      return r.error?.message ?? null;
    },
    onDone: onSaved,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New inbox rule"
      description="Agent-specific rules beat workspace-wide; priority breaks ties."
      onSubmit={f.onSubmit}
      submitLabel="Add rule"
      busy={f.busy}
      error={f.error}
    >
      <FormField label="Item kind">
        <select
          value={f.values.itemKind}
          onChange={(e) => f.set("itemKind", e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {ITEM_KINDS.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
      </FormField>
      <FormField label="Action">
        <select
          value={f.values.action}
          onChange={(e) => f.set("action", e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {ACTIONS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </FormField>
      <FormField label="Agent ID (optional)">
        <Input
          placeholder="Leave blank for workspace-wide"
          value={f.values.agentId}
          onChange={(e) => f.set("agentId", e.target.value)}
        />
      </FormField>
      <FormField label="Priority">
        <Input
          type="number"
          placeholder="0"
          value={f.values.priority}
          onChange={(e) => f.set("priority", e.target.value)}
        />
      </FormField>
    </FormDialog>
  );
}
