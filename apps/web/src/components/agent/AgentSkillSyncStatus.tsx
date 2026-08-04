"use client";

import { useQuery } from "urql";
import { AGENT_SKILL_SNAPSHOT_QUERY } from "@/lib/graphql/queries";
import { Badge } from "@/components/ui";

// Runtime skill sync status (parity #F22). Shows the reconcile between an agent's DESIRED skills and the
// runtime's reported state (installed/stale/missing/configured/external), plus the adapter mode. Read-
// only; the push that materializes skills into the agent's skills dir is the runtime seam.
interface Entry { skillId: string; state: string }
interface Snapshot { adapterType: string | null; mode: string; entries: Entry[]; warnings: string[] }
const stateVariant = (s: string) =>
  s === "installed" ? "green" : s === "stale" ? "yellow" : s === "missing" ? "red" : s === "configured" ? "blue" : "gray";

export function AgentSkillSyncStatus({ agentId }: { agentId: string }) {
  const [{ data }] = useQuery<{ agentSkillSnapshot: Snapshot }>({
    query: AGENT_SKILL_SNAPSHOT_QUERY,
    variables: { agentId },
  });
  const snap = data?.agentSkillSnapshot;
  if (!snap) return null;

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        Runtime sync — adapter <span className="font-mono">{snap.adapterType ?? "none"}</span> ({snap.mode})
      </p>
      {snap.mode === "unsupported" ? (
        <p className="text-xs text-muted-foreground">This adapter manages its own skills.</p>
      ) : snap.entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No skills to sync.</p>
      ) : (
        <ul className="flex flex-wrap gap-1">
          {snap.entries.map((e) => (
            <li key={e.skillId}>
              <Badge variant={stateVariant(e.state)}>{e.state}</Badge>
            </li>
          ))}
        </ul>
      )}
      {snap.warnings.map((w, i) => (
        <p key={i} className="text-xs text-yellow-600 dark:text-yellow-500">{w}</p>
      ))}
    </div>
  );
}
