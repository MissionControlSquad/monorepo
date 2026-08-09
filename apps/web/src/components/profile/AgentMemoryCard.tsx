"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { toast } from "sonner";
import { Brain, Search, X } from "lucide-react";
import {
  AGENT_MEMORY_ENTRIES_QUERY,
  SEARCH_AGENT_MEMORY_QUERY,
  MEMORY_OPERATIONS_QUERY,
} from "@/lib/graphql/queries";
import { FORGET_AGENT_MEMORY, SET_AGENT_MEMORY_PROVIDER } from "@/lib/graphql/mutations";
import { useFeatureFlag } from "@/components/context/FeatureFlagContext";
import { FLAG_KEYS, formatCents, MEMORY_PROVIDERS } from "@agentcenter/utils";
import { Card, Button, Badge } from "@/components/ui";
import { Input } from "@/components/ui/shadcn/input";
import { TimeAgo } from "@/components/common/TimeAgo";

// Domain 4: inspect what an agent has stored in memory (opt-in two-layer memory). Read + forget +
// recall search. Lives on the agent profile; MEMORY-gated (self-hides when off). No new backend.
interface MemoryEntry {
  id: string;
  content: string;
  sourceTaskId?: string | null;
  sourceKind?: string | null;
  createdAt: string;
}
interface MemoryOp {
  id: string;
  opType: string;
  provider?: string | null;
  success: boolean;
  error?: string | null;
  latencyMs?: number | null;
  resultCount?: number | null;
  costCents?: number | null;
  createdAt: string;
}

// The provenance/cost audit for an agent's memory — every capture/query/forget with timing + cost.
// Collapsed by default (audit data); reuses MEMORY_OPERATIONS_QUERY. Read-only.
function MemoryActivityLog({ agentId }: { agentId: string }) {
  const [open, setOpen] = useState(false);
  const [{ data }] = useQuery<{ memoryOperations: MemoryOp[] }>({
    query: MEMORY_OPERATIONS_QUERY,
    variables: { agentId, limit: 30 },
    pause: !open,
  });
  const ops = data?.memoryOperations ?? [];

  return (
    <div className="border-t border-border pt-2">
      <button
        className="text-xs text-muted-foreground transition hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Hide" : "Show"} memory activity
      </button>
      {open && (
        <ul className="mt-2 space-y-1">
          {ops.length === 0 && <li className="text-xs text-muted-foreground">No activity.</li>}
          {ops.map((o) => (
            <li key={o.id} className="flex items-center gap-2 text-xs">
              <Badge variant={o.success ? "gray" : "red"} size="sm">
                {o.opType}
              </Badge>
              {o.provider && <span className="text-muted-foreground">{o.provider}</span>}
              {o.resultCount != null && (
                <span className="text-muted-foreground">{o.resultCount} hit(s)</span>
              )}
              {o.latencyMs != null && (
                <span className="text-muted-foreground">{o.latencyMs}ms</span>
              )}
              {o.costCents ? (
                <span className="text-muted-foreground">{formatCents(o.costCents)}</span>
              ) : null}
              {!o.success && o.error && (
                <span className="truncate text-destructive">{o.error}</span>
              )}
              <TimeAgo date={o.createdAt} className="ml-auto text-muted-foreground" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AgentMemoryCard({
  agentId,
  currentProvider,
}: {
  agentId: string;
  currentProvider?: string | null;
}) {
  const enabled = useFeatureFlag(FLAG_KEYS.MEMORY);
  const [term, setTerm] = useState("");
  const [active, setActive] = useState(""); // committed search term
  const [, setAgentProvider] = useMutation(SET_AGENT_MEMORY_PROVIDER);
  const [provider, setProviderState] = useState(currentProvider ?? "none");
  const [savingProvider, setSavingProvider] = useState(false);

  async function onProviderChange(next: string) {
    setSavingProvider(true);
    try {
      const res = await setAgentProvider({ agentId, provider: next });
      if (res.error) toast.error(res.error.graphQLErrors[0]?.message ?? "Failed to set backend");
      else {
        setProviderState(next);
        toast.success(`Memory backend set to ${next}`);
      }
    } finally {
      setSavingProvider(false);
    }
  }

  const [{ data: listData, fetching }, refetch] = useQuery<{ agentMemoryEntries: MemoryEntry[] }>({
    query: AGENT_MEMORY_ENTRIES_QUERY,
    variables: { agentId, limit: 25 },
    pause: !enabled || active !== "",
  });
  const [{ data: searchData }] = useQuery<{ searchAgentMemory: MemoryEntry[] }>({
    query: SEARCH_AGENT_MEMORY_QUERY,
    variables: { agentId, query: active, limit: 25 },
    pause: !enabled || active === "",
  });
  const [, forget] = useMutation(FORGET_AGENT_MEMORY);
  const [busy, setBusy] = useState<string | null>(null);

  if (!enabled) return null;

  const entries = active
    ? (searchData?.searchAgentMemory ?? [])
    : (listData?.agentMemoryEntries ?? []);

  async function onForget(memoryId: string) {
    setBusy(memoryId);
    try {
      const res = await forget({ agentId, memoryId });
      if (res.error) toast.error(res.error.graphQLErrors[0]?.message ?? "Failed to forget");
      else {
        toast.success("Memory forgotten");
        refetch({ requestPolicy: "network-only" });
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Brain className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Memory</h2>
        <select
          className="ml-auto rounded border border-border bg-background px-2 py-0.5 text-xs"
          value={provider}
          disabled={savingProvider}
          onChange={(e) => onProviderChange(e.target.value)}
          title="Memory backend for this agent"
        >
          {MEMORY_PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">{entries.length}</span>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setActive(term.trim());
        }}
      >
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search what this agent remembers…"
        />
        {active ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              setTerm("");
              setActive("");
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="submit" size="sm" variant="secondary" disabled={!term.trim()}>
            <Search className="h-4 w-4" />
          </Button>
        )}
      </form>

      {fetching && entries.length === 0 && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
      {entries.length === 0 && !fetching && (
        <p className="text-sm text-muted-foreground">
          {active ? "No matching memories." : "This agent hasn't stored any memory yet."}
        </p>
      )}

      <ul className="space-y-2">
        {entries.map((m) => (
          <li key={m.id} className="rounded-lg border border-border p-2.5">
            <p className="whitespace-pre-wrap break-words text-sm text-foreground">{m.content}</p>
            <div className="mt-1.5 flex items-center gap-2">
              {m.sourceKind && (
                <Badge variant="gray" size="sm">
                  {m.sourceKind}
                </Badge>
              )}
              <TimeAgo date={m.createdAt} className="text-xs text-muted-foreground" />
              <button
                className="ml-auto text-xs text-muted-foreground transition hover:text-destructive disabled:opacity-50"
                disabled={busy === m.id}
                onClick={() => onForget(m.id)}
              >
                Forget
              </button>
            </div>
          </li>
        ))}
      </ul>

      <MemoryActivityLog agentId={agentId} />
    </Card>
  );
}
