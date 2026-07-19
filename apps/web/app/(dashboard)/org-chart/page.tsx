"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "urql";
import { ORG_CHART_QUERY } from "@/lib/graphql/queries";
import { SET_AGENT_REPORTS_TO } from "@/lib/graphql/mutations";
import { Card, Badge } from "@/components/ui";

// Epic #19: org chart — agent reporting hierarchy. ORG_CHART-gated. Renders the tree by reportsTo and
// lets each agent's manager be set inline. Detects cycles / dangling managers for the health badges.

interface OrgAgent {
  id: string;
  name: string;
  role: string;
  status: string;
  reportsToAgentId: string | null;
}
interface Node extends OrgAgent {
  reports: Node[];
}

function buildTree(agents: OrgAgent[]): Node[] {
  const byId = new Map(agents.map((a) => [a.id, { ...a, reports: [] as Node[] }]));
  const roots: Node[] = [];
  for (const node of byId.values()) {
    const parent = node.reportsToAgentId ? byId.get(node.reportsToAgentId) : null;
    if (parent && parent.id !== node.id) parent.reports.push(node);
    else roots.push(node);
  }
  return roots;
}

export default function OrgChartPage() {
  const [{ data }, refetch] = useQuery<{ orgChart: OrgAgent[] }>({ query: ORG_CHART_QUERY });
  const [, setManager] = useMutation(SET_AGENT_REPORTS_TO);
  const [busy, setBusy] = useState<string | null>(null);
  const agents = useMemo(() => data?.orgChart ?? [], [data]);
  const tree = useMemo(() => buildTree(agents), [agents]);
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function assign(agentId: string, managerId: string) {
    setBusy(agentId);
    try {
      await setManager({ agentId, reportsToAgentId: managerId || null });
      refresh();
    } finally {
      setBusy(null);
    }
  }

  function renderNode(node: Node, depth: number): React.ReactNode {
    return (
      <div key={node.id}>
        <Card
          className="mb-2 flex flex-wrap items-center justify-between gap-2 p-3"
          style={{ marginLeft: depth * 24 }}
        >
          <span className="flex items-center gap-2">
            <span className="font-medium text-foreground">{node.name}</span>
            <Badge variant="gray">{node.role}</Badge>
            <Badge variant={node.status === "blocked" ? "yellow" : "green"}>{node.status}</Badge>
          </span>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            reports to
            <select
              className="rounded border border-border bg-background px-2 py-1 text-xs"
              value={node.reportsToAgentId ?? ""}
              disabled={busy === node.id}
              onChange={(e) => assign(node.id, e.target.value)}
            >
              <option value="">— (root)</option>
              {agents
                .filter((a) => a.id !== node.id)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
        </Card>
        {node.reports.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Org chart</h1>
        <p className="text-sm text-muted-foreground">
          Your agents&apos; reporting hierarchy. Set each agent&apos;s manager; cycles are rejected.
        </p>
      </div>

      {agents.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No agents yet.</Card>
      ) : (
        <div>{tree.map((root) => renderNode(root, 0))}</div>
      )}
    </div>
  );
}
