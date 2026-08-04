"use client";

import { useQuery } from "urql";
import { Activity } from "lucide-react";
import { FLAGGED_AGENTS_QUERY, DECISIONS_QUERY } from "@/lib/graphql/queries";
import { Card, Badge, EmptyState } from "@/components/ui";

// Agent insights: productivity watchdog (parity #132) flagged agents + decision log (parity #40).
// PRODUCTIVITY_REVIEW / DECISION_TRAINING gated (read-only; the heartbeat/runtime writes them).
interface Flagged { id: string; agentId: string; verdict: string; score: number; reasons: string[] }
interface Decision { id: string; agentId: string | null; decisionType: string; choice: string; outcome: string | null; createdAt: string }
const verdictVariant = (v: string) => (v === "stuck" ? "red" : v === "struggling" ? "orange" : v === "idle" ? "yellow" : "green");

export default function AgentInsightsPage() {
  const [{ data: pData }] = useQuery<{ flaggedAgents: Flagged[] }>({ query: FLAGGED_AGENTS_QUERY });
  const [{ data: dData }] = useQuery<{ decisions: Decision[] }>({ query: DECISIONS_QUERY });
  const flagged = pData?.flaggedAgents ?? [];
  const decisions = (dData?.decisions ?? []).slice(0, 30);

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Agent insights</h1>
        <p className="text-sm text-muted-foreground">Productivity flags and the agent decision log.</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Flagged agents (productivity)</h2>
        {flagged.length === 0 ? (
          <EmptyState icon={<Activity className="h-8 w-8" />} title="No flagged agents" description="Agents flagged stuck or struggling by the watchdog appear here." />
        ) : (
          <Card padding="none">
            <ul className="divide-y divide-border">
              {flagged.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground font-mono">{f.agentId}</p>
                    <p className="truncate text-xs text-muted-foreground">{f.reasons.join(" · ")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{(f.score * 100).toFixed(0)}%</span>
                    <Badge variant={verdictVariant(f.verdict)}>{f.verdict}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Recent decisions</h2>
        {decisions.length === 0 ? (
          <EmptyState icon={<Activity className="h-8 w-8" />} title="No decisions logged" description="Recorded agent decisions (with outcomes) appear here." />
        ) : (
          <Card padding="none">
            <ul className="divide-y divide-border">
              {decisions.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{d.decisionType}: <span className="font-normal">{d.choice}</span></p>
                    <p className="text-xs text-muted-foreground">{d.agentId ? `agent ${d.agentId} · ` : ""}{new Date(d.createdAt).toLocaleString()}</p>
                  </div>
                  {d.outcome && <Badge variant={d.outcome === "success" ? "green" : d.outcome === "failure" ? "red" : "gray"}>{d.outcome}</Badge>}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
