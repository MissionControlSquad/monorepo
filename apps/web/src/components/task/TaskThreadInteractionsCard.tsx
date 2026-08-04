"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { toast } from "sonner";
import { THREAD_INTERACTIONS_QUERY } from "@/lib/graphql/queries";
import { RESOLVE_THREAD_INTERACTION } from "@/lib/graphql/mutations";
import { Badge, Button } from "@/components/ui";

// Domain 8 (task-autonomy): agent→human interactions on a task (suggest_tasks / ask_user_questions /
// request_confirmation). Humans resolve or dismiss the pending ones. Keyed by taskId; renders nothing
// when there are no pending interactions. THREAD_INTERACTIONS-gated server-side.
interface Interaction {
  id: string;
  kind: string;
  status: string;
  sourceRunId: string | null;
  payload: unknown;
  result: unknown;
  createdAt: string;
  resolvedAt: string | null;
}

function preview(payload: unknown): string {
  if (payload == null) return "";
  try {
    const s = typeof payload === "string" ? payload : JSON.stringify(payload);
    return s.length > 200 ? `${s.slice(0, 200)}…` : s;
  } catch {
    return "";
  }
}

export function TaskThreadInteractionsCard({ taskId }: { taskId: string }) {
  const [{ data }, refetch] = useQuery<{ threadInteractions: Interaction[] }>({
    query: THREAD_INTERACTIONS_QUERY,
    variables: { taskId, status: "pending" },
  });
  const [, resolve] = useMutation(RESOLVE_THREAD_INTERACTION);
  const [busy, setBusy] = useState<string | null>(null);

  const pending = data?.threadInteractions ?? [];
  if (pending.length === 0) return null;

  async function act(id: string, decision: "resolved" | "dismissed") {
    setBusy(id);
    try {
      const res = await resolve({ id, decision });
      if (res.error) {
        toast.error(res.error.graphQLErrors[0]?.message ?? "Failed to update");
        return;
      }
      toast.success(decision === "resolved" ? "Resolved" : "Dismissed");
      refetch({ requestPolicy: "network-only" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-foreground">Agent requests ({pending.length})</h3>
      <div className="space-y-2">
        {pending.map((it) => (
          <div key={it.id} className="rounded-lg border border-border p-2.5">
            <div className="flex items-center gap-2">
              <Badge variant="yellow" size="sm">
                {it.kind.replace(/_/g, " ")}
              </Badge>
            </div>
            {preview(it.payload) && (
              <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                {preview(it.payload)}
              </p>
            )}
            <div className="mt-2 flex gap-2">
              <Button size="sm" disabled={busy === it.id} onClick={() => act(it.id, "resolved")}>
                Resolve
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy === it.id}
                onClick={() => act(it.id, "dismissed")}
              >
                Dismiss
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
