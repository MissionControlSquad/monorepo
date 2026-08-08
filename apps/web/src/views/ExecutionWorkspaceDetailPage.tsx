"use client";

import { useQuery } from "urql";
import { Loader2, AlertCircle } from "lucide-react";
import { EXECUTION_WORKSPACES_DETAIL_QUERY } from "@/lib/graphql/queries";
import { Breadcrumbs, Card, Badge, PageLayout } from "@/components/ui";
import { useFeatureFlags } from "@/components/context/FeatureFlagContext";
import { FLAG_KEYS } from "@agentcenter/utils";
import { selectWorkspaceById, formatTimestamp } from "@/lib/work-detail";

// Detail route for one execution workspace (Tier D / Phase 3). Reuses the workspace-scoped
// `executionWorkspaces` list resolver and selects the row by id — no new server field. Read-only
// view: realized runtime config (strategy/provider/repo/branch) and the phase-log operations.

interface Operation {
  id: string;
  phase: string;
  command: string | null;
  exitCode: number | null;
  status: string;
  detail: string | null;
  startedAt: string;
}
interface ExecWorkspace {
  id: string;
  projectId: string | null;
  taskId: string | null;
  runId: string | null;
  strategyType: string;
  name: string;
  status: string;
  repoUrl: string | null;
  branchName: string | null;
  providerType: string;
  providerRef: string | null;
  createdAt: string;
  operations: Operation[];
}

function ConfigRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border p-2">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={`truncate text-sm text-foreground ${mono ? "font-mono text-xs" : ""}`}>
        {value ?? "—"}
      </dd>
    </div>
  );
}

export function ExecutionWorkspaceDetailPage({ workspaceId }: { workspaceId: string }) {
  const { isEnabled } = useFeatureFlags();
  const enabled = isEnabled(FLAG_KEYS.EXECUTION_WORKSPACES);

  const [{ data, fetching, error }] = useQuery<{ executionWorkspaces: ExecWorkspace[] }>({
    query: EXECUTION_WORKSPACES_DETAIL_QUERY,
    pause: !enabled,
  });

  if (!enabled) {
    return (
      <PageLayout maxWidth="wide">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Environments", href: "/environments" },
            { label: "Unavailable" },
          ]}
        />
        <Card padding="lg" className="text-center text-sm text-muted-foreground">
          Execution workspaces are not enabled for this workspace.
        </Card>
      </PageLayout>
    );
  }

  if (fetching && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm font-medium">Could not load this workspace</p>
      </div>
    );
  }

  const ws = selectWorkspaceById(data?.executionWorkspaces, workspaceId);
  if (!ws) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm font-medium">Execution workspace not found</p>
      </div>
    );
  }

  return (
    <PageLayout maxWidth="wide">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Environments", href: "/environments" },
          { label: ws.name },
        ]}
      />

      <div className="space-y-4">
        {/* Header */}
        <Card padding="lg" className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-foreground">{ws.name}</h1>
            <Badge variant="gray">{ws.strategyType}</Badge>
            <Badge
              variant={ws.status === "failed" ? "red" : ws.status === "closed" ? "gray" : "green"}
            >
              {ws.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">Created {formatTimestamp(ws.createdAt)}</p>
        </Card>

        {/* Runtime config */}
        <Card padding="lg" className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Runtime config</h2>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ConfigRow label="Strategy" value={ws.strategyType} />
            <ConfigRow label="Provider" value={ws.providerType} />
            <ConfigRow label="Provider ref" value={ws.providerRef} mono />
            <ConfigRow label="Repo" value={ws.repoUrl} mono />
            <ConfigRow label="Branch" value={ws.branchName} mono />
            <ConfigRow label="Run" value={ws.runId} mono />
            <ConfigRow label="Task" value={ws.taskId} mono />
            <ConfigRow label="Project" value={ws.projectId} mono />
          </dl>
        </Card>

        {/* Operations */}
        <Card padding="lg" className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">
            Operations ({ws.operations.length})
          </h2>
          {ws.operations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No operations recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1 pr-4 font-medium">Phase</th>
                    <th className="py-1 pr-4 font-medium">Status</th>
                    <th className="py-1 pr-4 font-medium">Exit</th>
                    <th className="py-1 pr-4 font-medium">Command</th>
                    <th className="py-1 pr-4 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {ws.operations.map((op) => (
                    <tr key={op.id} className="border-t border-border align-top">
                      <td className="py-1.5 pr-4 text-foreground">{op.phase}</td>
                      <td className="py-1.5 pr-4">
                        <Badge variant={op.status === "failed" ? "red" : "green"}>
                          {op.status}
                        </Badge>
                      </td>
                      <td className="py-1.5 pr-4 font-mono text-xs text-muted-foreground">
                        {op.exitCode ?? "—"}
                      </td>
                      <td className="py-1.5 pr-4">
                        <span className="block max-w-md truncate font-mono text-xs text-muted-foreground">
                          {op.command ?? "—"}
                        </span>
                        {op.detail && (
                          <span className="block max-w-md truncate text-xs text-destructive">
                            {op.detail}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-4 text-xs text-muted-foreground">
                        {formatTimestamp(op.startedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </PageLayout>
  );
}
