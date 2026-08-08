"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "urql";
import { Brain, Search, Trash2 } from "lucide-react";
import {
  AGENTS_QUERY,
  AGENT_MEMORY_ENTRIES_QUERY,
  SEARCH_AGENT_MEMORY_QUERY,
  MEMORY_OPERATIONS_QUERY,
  COMPANY_MEMORY_DEFAULT_QUERY,
} from "@/lib/graphql/queries";
import { FORGET_AGENT_MEMORY } from "@/lib/graphql/mutations";
import {
  Card,
  Badge,
  Button,
  Input,
  Select,
  Spinner,
  EmptyState,
  ConfirmDialog,
} from "@/components/ui";
import { WhenAdmin } from "@/components/auth/WhenAdmin";
import {
  formatProvenance,
  formatMemoryCost,
  formatLatency,
  opTypeBadgeVariant,
  sourceKindLabel,
  attributionLabel,
} from "@/lib/memory-format";

// Domain 4 GAP-D: Agent memory inspect surface. Read-only by default - lists an agent's stored
// `db`-provider memory entries (content + provenance), a recall search box (searchAgentMemory), and
// the memory operations audit log (with latency + cost). The whole surface is MEMORY-flag gated (the
// nav entry + the server queries requireFeature). The only mutation - forget an entry - is admin-gated
// via <WhenAdmin> on top of the server's admin requireRole.

interface AgentLite {
  id: string;
  name: string;
  role: string;
  memoryProvider: string | null;
}

interface MemoryEntry {
  id: string;
  content: string;
  sourceTaskId: string | null;
  sourceKind: string | null;
  sourceRefId?: string | null;
  createdAt: string;
}

interface MemoryOp {
  id: string;
  provider: string;
  opType: string;
  taskId: string | null;
  runId: string | null;
  sourceKind: string | null;
  success: boolean;
  error: string | null;
  latencyMs: number | null;
  resultCount: number | null;
  costCents: number | null;
  attributionMode: string | null;
  createdAt: string;
}

function providerVariant(p: string | null | undefined) {
  return p === "db" ? "green" : p === "markdown" ? "blue" : "gray";
}

export function MemoryInspectPage() {
  const [{ data: agentsData, fetching: agentsFetching, error: agentsError }] = useQuery<{
    agents: AgentLite[];
  }>({ query: AGENTS_QUERY });
  const agents = useMemo(() => agentsData?.agents ?? [], [agentsData]);

  const [agentId, setAgentId] = useState<string>("");
  // Resolve the effective selected agent (default to the first once loaded).
  const selectedId = agentId || agents[0]?.id || "";
  const selectedAgent = agents.find((a) => a.id === selectedId) ?? null;

  const [{ data: defaultData }] = useQuery<{ companyMemoryDefault: string }>({
    query: COMPANY_MEMORY_DEFAULT_QUERY,
  });
  const companyDefault = defaultData?.companyMemoryDefault ?? "none";

  // Search: `query` is the live input, `committed` is what we actually run (on submit) so we don't
  // fire a GraphQL request per keystroke.
  const [query, setQuery] = useState("");
  const [committed, setCommitted] = useState("");
  const searching = committed.trim().length > 0;

  const [{ data: entriesData, fetching: entriesFetching, error: entriesError }] = useQuery<{
    agentMemoryEntries: MemoryEntry[];
  }>({
    query: AGENT_MEMORY_ENTRIES_QUERY,
    variables: { agentId: selectedId, limit: 100 },
    pause: !selectedId || searching,
  });

  const [{ data: searchData, fetching: searchFetching, error: searchError }, refetchSearch] =
    useQuery<{ searchAgentMemory: MemoryEntry[] }>({
      query: SEARCH_AGENT_MEMORY_QUERY,
      variables: { agentId: selectedId, query: committed, limit: 100 },
      pause: !selectedId || !searching,
    });

  const [{ data: opsData, fetching: opsFetching, error: opsError }] = useQuery<{
    memoryOperations: MemoryOp[];
  }>({
    query: MEMORY_OPERATIONS_QUERY,
    variables: { agentId: selectedId, limit: 50 },
    pause: !selectedId,
  });

  const entries = searching
    ? (searchData?.searchAgentMemory ?? [])
    : (entriesData?.agentMemoryEntries ?? []);
  const entriesLoading = searching ? searchFetching : entriesFetching;
  const entriesErr = searching ? searchError : entriesError;
  const ops = opsData?.memoryOperations ?? [];

  const [, forget] = useMutation(FORGET_AGENT_MEMORY);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [forgetting, setForgetting] = useState(false);

  async function onForget() {
    if (!confirmId || !selectedId) return;
    setForgetting(true);
    try {
      await forget({ agentId: selectedId, memoryId: confirmId });
      setConfirmId(null);
      // Re-run the active recall query so the removed entry disappears immediately.
      if (searching) refetchSearch({ requestPolicy: "network-only" });
    } finally {
      setForgetting(false);
    }
  }

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCommitted(query);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Agent memory</h1>
        <p className="text-sm text-muted-foreground">
          Inspect what an agent remembers - stored entries, their provenance, and the memory
          operations audit log.
        </p>
      </div>

      {/* Agent picker + binding summary */}
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex-1 space-y-1.5">
          <label htmlFor="memory-agent" className="text-xs font-medium text-muted-foreground">
            Agent
          </label>
          {agentsFetching && agents.length === 0 ? (
            <div className="flex h-9 items-center">
              <Spinner />
            </div>
          ) : agents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No agents in this workspace yet.</p>
          ) : (
            <Select
              id="memory-agent"
              value={selectedId}
              onChange={(e) => {
                setAgentId(e.target.value);
                setQuery("");
                setCommitted("");
              }}
              className="sm:max-w-xs"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.role})
                </option>
              ))}
            </Select>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Provider</span>
          <Badge variant={providerVariant(selectedAgent?.memoryProvider)}>
            {selectedAgent?.memoryProvider ?? "none"}
          </Badge>
          <span className="text-muted-foreground/70">company default: {companyDefault}</span>
        </div>
      </Card>

      {agentsError && (
        <Card className="p-4 text-sm text-destructive">
          Could not load agents. Memory may be disabled for this workspace.
        </Card>
      )}

      {/* Search + entries */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">
            {searching ? "Search results" : "Recent entries"}
          </h2>
          {entries.length > 0 && (
            <span className="text-xs text-muted-foreground">{entries.length} shown</span>
          )}
        </div>

        <form onSubmit={submitSearch} className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this agent's memory…"
            disabled={!selectedId}
          />
          <Button type="submit" variant="secondary" size="sm" disabled={!selectedId}>
            <Search className="size-4" />
            Search
          </Button>
          {searching && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                setCommitted("");
              }}
            >
              Clear
            </Button>
          )}
        </form>

        {!selectedId ? null : entriesLoading && entries.length === 0 ? (
          <div className="flex justify-center p-8">
            <Spinner />
          </div>
        ) : entriesErr ? (
          <Card className="p-4 text-sm text-destructive">Could not load memory entries.</Card>
        ) : entries.length === 0 ? (
          <EmptyState
            icon={<Brain />}
            title={searching ? "No matches" : "No memory yet"}
            description={
              searching
                ? "No stored entries match your search. Try a different term."
                : "This agent has no stored memory entries. Entries are captured after runs when its provider is set to db."
            }
          />
        ) : (
          <Card padding="none">
            <ul className="divide-y divide-border">
              {entries.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div className="min-w-0 space-y-1">
                    <p className="whitespace-pre-wrap break-words text-sm text-foreground">
                      {e.content}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      {e.sourceKind && (
                        <Badge variant="gray" size="sm">
                          {sourceKindLabel(e.sourceKind)}
                        </Badge>
                      )}
                      <span>{formatProvenance(e)}</span>
                      <span aria-hidden>·</span>
                      <span>{new Date(e.createdAt).toLocaleString()}</span>
                    </p>
                  </div>
                  <WhenAdmin>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Forget entry"
                      onClick={() => setConfirmId(e.id)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </WhenAdmin>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {/* Operations audit log */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Memory operations</h2>
        {!selectedId ? null : opsFetching && ops.length === 0 ? (
          <div className="flex justify-center p-8">
            <Spinner />
          </div>
        ) : opsError ? (
          <Card className="p-4 text-sm text-destructive">Could not load memory operations.</Card>
        ) : ops.length === 0 ? (
          <EmptyState
            icon={<Brain />}
            title="No operations logged"
            description="Memory reads, captures, and deletes for this agent will appear here as they happen."
          />
        ) : (
          <Card padding="none" className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Operation</th>
                  <th className="px-4 py-2 font-medium">Source</th>
                  <th className="px-4 py-2 font-medium">Results</th>
                  <th className="px-4 py-2 font-medium">Latency</th>
                  <th className="px-4 py-2 font-medium">Cost</th>
                  <th className="px-4 py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ops.map((op) => (
                  <tr key={op.id}>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={opTypeBadgeVariant(op.opType)} size="sm">
                          {op.opType}
                        </Badge>
                        {!op.success && (
                          <Badge variant="red" size="sm">
                            failed
                          </Badge>
                        )}
                      </div>
                      {op.error && <p className="mt-1 text-xs text-destructive">{op.error}</p>}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {op.sourceKind ? sourceKindLabel(op.sourceKind) : op.provider}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">
                      {op.resultCount ?? "-"}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">
                      {formatLatency(op.latencyMs)}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">
                      <span title={attributionLabel(op.attributionMode)}>
                        {formatMemoryCost(op.costCents)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {new Date(op.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <ConfirmDialog
        isOpen={confirmId !== null}
        onClose={() => setConfirmId(null)}
        onConfirm={onForget}
        title="Forget this memory entry?"
        description="This permanently deletes the stored entry for this agent. This cannot be undone."
        confirmLabel="Forget"
        variant="danger"
        loading={forgetting}
      />
    </div>
  );
}
