"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "urql";
import { ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { ORG_CHART_QUERY } from "@/lib/graphql/queries";
import { SET_AGENT_REPORTS_TO } from "@/lib/graphql/mutations";
import { AgentStatus, computeOrgLayout } from "@agentcenter/utils";
import { Card, Badge } from "@/components/ui";

// Epic #19: graphical org chart — an SVG canvas of the agent reporting hierarchy (tidy top-down
// layout via the shared computeOrgLayout helper). Click a node to reassign its manager; zoom to fit.

interface OrgAgent {
  id: string;
  name: string;
  role: string;
  status: string;
  reportsToAgentId: string | null;
}

const NODE_W = 190;
const NODE_H = 64;

export default function OrgChartPage() {
  const [{ data }, refetch] = useQuery<{ orgChart: OrgAgent[] }>({ query: ORG_CHART_QUERY });
  const [, setManager] = useMutation(SET_AGENT_REPORTS_TO);
  const [busy, setBusy] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const agents = useMemo(() => data?.orgChart ?? [], [data]);
  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const layout = useMemo(
    () => computeOrgLayout(agents, { nodeWidth: NODE_W, nodeHeight: NODE_H }),
    [agents],
  );
  const selected = selectedId ? byId.get(selectedId) : null;
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 p-4 sm:p-6">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Org chart</h1>
          <p className="text-sm text-muted-foreground">
            Your agents&apos; reporting hierarchy. Click a node to set its manager.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="rounded border border-border p-1.5 text-muted-foreground hover:bg-muted"
            onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))}
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="w-10 text-center text-xs text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <button
            className="rounded border border-border p-1.5 text-muted-foreground hover:bg-muted"
            onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            className="rounded border border-border p-1.5 text-muted-foreground hover:bg-muted"
            onClick={() => setZoom(1)}
            title="Reset zoom"
          >
            <Maximize className="h-4 w-4" />
          </button>
        </div>
      </div>

      {agents.length === 0 ? (
        <Card className="mx-4 p-8 text-center text-sm text-muted-foreground sm:mx-6">
          No agents yet.
        </Card>
      ) : (
        <div className="relative flex-1 overflow-auto border-t border-border bg-muted/20">
          <div
            className="relative origin-top-left"
            style={{
              width: layout.width,
              height: layout.height,
              transform: `scale(${zoom})`,
              margin: 24,
            }}
          >
            {/* Connectors */}
            <svg
              className="pointer-events-none absolute inset-0"
              width={layout.width}
              height={layout.height}
            >
              {layout.edges.map((e) => {
                const p = layout.nodes[e.from];
                const c = layout.nodes[e.to];
                if (!p || !c) return null;
                const x1 = p.x + NODE_W / 2;
                const y1 = p.y + NODE_H;
                const x2 = c.x + NODE_W / 2;
                const y2 = c.y;
                const my = (y1 + y2) / 2;
                return (
                  <path
                    key={`${e.from}-${e.to}`}
                    d={`M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`}
                    className="stroke-border"
                    strokeWidth={1.5}
                    fill="none"
                  />
                );
              })}
            </svg>

            {/* Nodes */}
            {agents.map((a) => {
              const n = layout.nodes[a.id];
              if (!n) return null;
              const isSel = a.id === selectedId;
              return (
                <button
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
                  className={`absolute flex flex-col justify-center gap-1 rounded-lg border bg-background px-3 text-left shadow-sm transition ${
                    isSel
                      ? "border-blue-500 ring-2 ring-blue-200"
                      : "border-border hover:border-blue-300"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`h-2 w-2 flex-shrink-0 rounded-full ${
                        a.status === AgentStatus.BLOCKED ? "bg-yellow-500" : "bg-success"
                      }`}
                    />
                    <span className="truncate text-sm font-medium text-foreground">{a.name}</span>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{a.role}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Manager editor for the selected node */}
      {selected && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border p-3 sm:px-6">
          <Badge variant="gray">{selected.name}</Badge>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            reports to
            <select
              className="rounded border border-border bg-background px-2 py-1 text-xs"
              value={selected.reportsToAgentId ?? ""}
              disabled={busy === selected.id}
              onChange={(e) => assign(selected.id, e.target.value)}
            >
              <option value="">— (root)</option>
              {agents
                .filter((a) => a.id !== selected.id)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setSelectedId(null)}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
