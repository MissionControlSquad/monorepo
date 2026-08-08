"use client";

import { useQuery } from "urql";
import { AlertCircle, Info, ShieldCheck, Wrench } from "lucide-react";
import { AGENT_TOOL_ACCESS_POLICIES_QUERY } from "@/lib/graphql/queries";
import { Badge, Card, EmptyState, SkeletonList } from "@/components/ui";

// Agent Detail · Tools tab (Paperclip parity: AgentToolsTab). Read-only view of the agent's effective
// tool access, resolved from the EXISTING ToolAccessPolicy store (workspace-wide + agent-scoped rules).
// Enforcement is the tool runtime's job; this surface just communicates the resolved allow/deny set.

interface ToolAccessPolicyRow {
  id: string;
  agentId: string | null;
  scope: "agent" | "workspace" | string;
  toolPattern: string;
  effect: string;
  priority: number;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
}

export function AgentToolsTab({ agentId, agentName }: { agentId: string; agentName: string }) {
  const [result] = useQuery<{ agentToolAccessPolicies: ToolAccessPolicyRow[] }>({
    query: AGENT_TOOL_ACCESS_POLICIES_QUERY,
    variables: { agentId },
    pause: !agentId,
  });

  const { data, fetching, error } = result;
  const policies = data?.agentToolAccessPolicies;

  if (fetching && !data) {
    return (
      <Card className="p-5">
        <SkeletonList count={5} height="h-11" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="flex flex-col items-center gap-2 p-8 text-center">
        <AlertCircle className="h-6 w-6 text-destructive" />
        <p className="text-sm font-medium text-foreground">Could not load tool access</p>
        <p className="text-xs text-muted-foreground">{error.message}</p>
      </Card>
    );
  }

  const rules = policies ?? [];
  const denyCount = rules.filter((r) => r.effect === "deny").length;

  return (
    <div className="space-y-4">
      {/* Effective-access explainer - the resolved set, not editable here. */}
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
        <div className="space-y-1 text-sm">
          <p className="font-medium text-foreground">Effective tool access</p>
          <p className="text-xs text-muted-foreground">
            The rules {agentName} is evaluated against. Access is allow-by-default: a tool call is
            blocked only when a matching <span className="font-medium">deny</span> rule wins.
            Agent-scoped rules override workspace-wide ones, then higher priority, then a more
            specific pattern. Editing rules is an admin action elsewhere.
          </p>
        </div>
      </div>

      {rules.length === 0 ? (
        <EmptyState
          icon={<Wrench className="h-6 w-6 text-muted-foreground" />}
          title="No tool restrictions"
          description={`No allow/deny rules apply to ${agentName}. Every tool is allowed by default until a policy narrows access.`}
        />
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Access rules</h2>
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {rules.length} {rules.length === 1 ? "rule" : "rules"}
              {denyCount > 0 ? ` · ${denyCount} deny` : ""}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Tool pattern</th>
                  <th className="px-4 py-2 font-medium">Effect</th>
                  <th className="px-4 py-2 font-medium">Scope</th>
                  <th className="px-4 py-2 font-medium">Priority</th>
                  <th className="px-4 py-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rules.map((rule) => (
                  <tr key={rule.id} className="align-top">
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs text-foreground">{rule.toolPattern}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={rule.effect === "deny" ? "red" : "green"} size="sm">
                        {rule.effect}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={rule.scope === "agent" ? "blue" : "gray"} size="sm">
                        {rule.scope === "agent" ? "This agent" : "Workspace"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
                      {rule.priority}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {rule.reason || <span className="text-muted-foreground/60">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            Enforcement is applied by the tool runtime at call time.
          </div>
        </Card>
      )}
    </div>
  );
}
