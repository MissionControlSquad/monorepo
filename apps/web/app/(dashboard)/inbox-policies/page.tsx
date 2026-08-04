"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { Inbox } from "lucide-react";
import { INBOX_POLICIES_QUERY } from "@/lib/graphql/queries";
import { DELETE_INBOX_POLICY } from "@/lib/graphql/mutations";
import { Button, Card, Badge, EmptyState } from "@/components/ui";
import { InboxPolicyDialog } from "@/components/dialogs/InboxPolicyDialog";

// Inbox-agent routing policy (parity #74). INBOX_POLICY-gated, admin. Decides per item kind whether an
// agent auto-handles, routes to a human, or ignores. Agent-specific rules beat workspace-wide; priority
// breaks ties. The inbox/queue processor consults resolveInboxAction at dispatch.
interface InboxPolicy {
  id: string; agentId: string | null; itemKind: string; action: string; priority: number; enabled: boolean;
}
const actionVariant = (a: string) => (a === "auto_handle" ? "green" : a === "ignore" ? "gray" : "yellow");

export default function InboxPoliciesPage() {
  const [{ data, fetching }, refetch] = useQuery<{ inboxPolicies: InboxPolicy[] }>({ query: INBOX_POLICIES_QUERY });
  const [, del] = useMutation(DELETE_INBOX_POLICY);
  const [open, setOpen] = useState(false);
  const rows = [...(data?.inboxPolicies ?? [])].sort((a, b) => b.priority - a.priority);
  const refresh = () => refetch({ requestPolicy: "network-only" });

  return (
    <div className="mx-auto space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Inbox policies</h1>
          <p className="text-sm text-muted-foreground">How agents route inbox items: auto-handle, route to a human, or ignore.</p>
        </div>
        <Button onClick={() => setOpen(true)}>New rule</Button>
      </div>

      <InboxPolicyDialog open={open} onOpenChange={setOpen} onSaved={refresh} />

      {rows.length === 0 && !fetching ? (
        <EmptyState icon={<Inbox className="h-8 w-8" />} title="No inbox policies" description="Default: everything routes to a human." />
      ) : (
        <Card padding="none">
          <ul className="divide-y divide-border">
            {rows.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground font-mono">{p.itemKind}</p>
                  <p className="text-xs text-muted-foreground">priority {p.priority}{p.agentId ? ` · agent ${p.agentId}` : " · workspace-wide"}{!p.enabled ? " · disabled" : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={actionVariant(p.action)}>{p.action}</Badge>
                  <Button variant="ghost" size="sm" onClick={async () => { await del({ id: p.id }); refresh(); }}>Delete</Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
