"use client";

import { useQuery } from "urql";
import { Loader2, AlertCircle } from "lucide-react";
import { ROUTINE_QUERY, ROUTINE_RUNS_QUERY } from "@/lib/graphql/queries";
import { Breadcrumbs, Card, Badge, PageLayout } from "@/components/ui";
import { useFeatureFlags } from "@/components/context/FeatureFlagContext";
import { FLAG_KEYS } from "@agentcenter/utils";
import { describeTrigger, runStatusVariant, formatTimestamp } from "@/lib/work-detail";

// Detail route for a single routine (Epic #7). Reuses the existing routine / routineRuns reads —
// the trigger's cron schedule fields are newly exposed (read-only) on the existing RoutineTrigger
// type. Read-only view: definition, triggers (cron / webhook / manual), and recent runs.

interface Trigger {
  id: string;
  type: string;
  cronExpression: string | null;
  timezone: string | null;
  nextFireAt: string | null;
  publicId: string | null;
  isEnabled: boolean;
}
interface Revision {
  id: string;
  version: number;
  createdAt: string;
}
interface Routine {
  id: string;
  name: string;
  description: string | null;
  definition: unknown;
  isActive: boolean;
  timezone: string;
  currentVersion: number;
  assigneeAgentId: string | null;
  priority: string | null;
  goalId: string | null;
  createdAt: string;
  updatedAt: string;
  triggers: Trigger[];
  revisions: Revision[];
}
interface RoutineRun {
  id: string;
  status: string;
  triggeredBy: string;
  generatedTaskId: string | null;
  error: string | null;
  createdAt: string;
}

export function RoutineDetailPage({ routineId }: { routineId: string }) {
  const { isEnabled } = useFeatureFlags();
  const enabled = isEnabled(FLAG_KEYS.PIPELINES_ROUTINES);

  const [{ data, fetching, error }] = useQuery<{ routine: Routine | null }>({
    query: ROUTINE_QUERY,
    variables: { id: routineId },
    pause: !enabled,
  });
  const [{ data: runsData }] = useQuery<{ routineRuns: RoutineRun[] }>({
    query: ROUTINE_RUNS_QUERY,
    variables: { routineId, limit: 25 },
    pause: !enabled,
  });

  if (!enabled) {
    return (
      <PageLayout maxWidth="wide">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Routines", href: "/routines" },
            { label: "Unavailable" },
          ]}
        />
        <Card padding="lg" className="text-center text-sm text-muted-foreground">
          Routines are not enabled for this workspace.
        </Card>
      </PageLayout>
    );
  }

  const routine = data?.routine;

  if (fetching && !routine) {
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
        <p className="text-sm font-medium">Could not load this routine</p>
      </div>
    );
  }
  if (!routine) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm font-medium">Routine not found</p>
      </div>
    );
  }

  const runs = runsData?.routineRuns ?? [];
  const definitionText = JSON.stringify(routine.definition ?? {}, null, 2);

  return (
    <PageLayout maxWidth="wide">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Routines", href: "/routines" },
          { label: routine.name },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Header */}
          <Card padding="lg" className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-foreground">{routine.name}</h1>
              <Badge variant="gray">v{routine.currentVersion}</Badge>
              {!routine.isActive && <Badge variant="gray">inactive</Badge>}
              {routine.priority && <Badge variant="yellow">{routine.priority}</Badge>}
            </div>
            {routine.description && (
              <p className="text-sm text-muted-foreground">{routine.description}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Timezone {routine.timezone} · Updated {formatTimestamp(routine.updatedAt)}
            </p>
          </Card>

          {/* Definition */}
          <Card padding="lg" className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Definition</h2>
            <pre className="max-h-96 overflow-auto rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              {definitionText}
            </pre>
          </Card>

          {/* Recent runs */}
          <Card padding="lg" className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Recent runs ({runs.length})</h2>
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No runs yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-1 pr-4 font-medium">Status</th>
                      <th className="py-1 pr-4 font-medium">Trigger</th>
                      <th className="py-1 pr-4 font-medium">Task</th>
                      <th className="py-1 pr-4 font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="py-1.5 pr-4">
                          <Badge variant={runStatusVariant(r.status)}>{r.status}</Badge>
                        </td>
                        <td className="py-1.5 pr-4 text-muted-foreground">{r.triggeredBy}</td>
                        <td className="py-1.5 pr-4">
                          {r.generatedTaskId ? (
                            <a
                              href={`/task/${r.generatedTaskId}`}
                              className="font-mono text-xs text-muted-foreground hover:underline"
                            >
                              {r.generatedTaskId.slice(0, 8)}
                            </a>
                          ) : r.error ? (
                            <span className="text-xs text-destructive">{r.error}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-4 text-xs text-muted-foreground">
                          {formatTimestamp(r.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar: triggers */}
        <div className="space-y-4">
          <Card padding="lg" className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">
              Triggers ({routine.triggers.length})
            </h2>
            {routine.triggers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No triggers.</p>
            ) : (
              <ul className="space-y-2">
                {routine.triggers.map((t) => (
                  <li key={t.id} className="rounded-lg border border-border p-2.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="blue">{t.type}</Badge>
                      {!t.isEnabled && <Badge variant="gray">disabled</Badge>}
                    </div>
                    <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                      {describeTrigger(t)}
                    </p>
                    {t.nextFireAt && (
                      <p className="text-xs text-muted-foreground">
                        Next: {formatTimestamp(t.nextFireAt)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card padding="lg" className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">
              Revisions ({routine.revisions.length})
            </h2>
            {routine.revisions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No revisions.</p>
            ) : (
              <ul className="space-y-1.5">
                {routine.revisions.map((rev) => (
                  <li
                    key={rev.id}
                    className="flex items-center justify-between text-xs text-muted-foreground"
                  >
                    <span className="text-foreground">v{rev.version}</span>
                    <span>{formatTimestamp(rev.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </PageLayout>
  );
}
