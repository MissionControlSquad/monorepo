"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { Inbox } from "lucide-react";
import { INBOX_POLICIES_QUERY } from "@/lib/graphql/queries";
import { SET_INBOX_POLICY, DELETE_INBOX_POLICY } from "@/lib/graphql/mutations";
import { Button, Card, Badge, Input, EmptyState } from "@/components/ui";

// Inbox-agent routing policy (parity #74). INBOX_POLICY-gated, admin. Decides per item kind whether an
// agent auto-handles, routes to a human, or ignores. Agent-specific rules beat workspace-wide; priority
// breaks ties. The inbox/queue processor consults resolveInboxAction at dispatch.
interface InboxPolicy {
  id: string; agentId: string | null; itemKind: string; action: string; priority: number; enabled: boolean;
}
const ITEM_KINDS = ["mention", "task_review", "clarification", "handoff", "approval"];
const ACTIONS = ["auto_handle", "route_to_human", "ignore"];
const actionVariant = (a: string) => (a === "auto_handle" ? "green" : a === "ignore" ? "gray" : "yellow");

export default function InboxPoliciesPage() {
  const [{ data, fetching }, refetch] = useQuery<{ inboxPolicies: InboxPolicy[] }>({ query: INBOX_POLICIES_QUERY });
  const [, set] = useMutation(SET_INBOX_POLICY);
  const [, del] = useMutation(DELETE_INBOX_POLICY);
  const [form, setForm] = useState({ itemKind: ITEM_KINDS[0], action: ACTIONS[0], priority: "0", agentId: "" });
  const [error, setError] = useState<string | null>(null);
  const rows = [...(data?.inboxPolicies ?? [])].sort((a, b) => b.priority - a.priority);
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function onAdd() {
    const r = await set({ itemKind: form.itemKind, action: form.action, priority: parseInt(form.priority, 10) || 0, agentId: form.agentId.trim() || null });
    if (r.error) return setError(r.error.message);
    setError(null); setForm({ ...form, agentId: "", priority: "0" }); refresh();
  }

  return (
    <div className="mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Inbox policies</h1>
        <p className="text-sm text-muted-foreground">How agents route inbox items: auto-handle, route to a human, or ignore.</p>
      </div>
      <Card padding="lg" className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">New rule</h2>
        <div className="flex flex-wrap items-end gap-2">
          <select value={form.itemKind} onChange={(e) => setForm({ ...form, itemKind: e.target.value })} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            {ITEM_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <Input placeholder="Agent ID (optional)" value={form.agentId} onChange={(e) => setForm({ ...form, agentId: e.target.value })} className="w-44" />
          <Input placeholder="Priority" type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-24" />
          <Button onClick={onAdd}>Add rule</Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>
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
