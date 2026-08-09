"use client";

import { useMemo } from "react";
import { useQuery } from "urql";
import { Loader2 } from "lucide-react";
import { WORK_TIMELINE_QUERY } from "@/lib/graphql/queries";
import { Card, PageLayout } from "@/components/ui";
import { computeTimelineBars, timelineWindow } from "@agentcenter/utils";

// Work timeline — a Gantt of completed agent work spans, grouped by agent. Bars are positioned by the
// shared computeTimelineBars helper; the x-axis is the min→max window of all spans.

interface Entry {
  id: string;
  agentId: string;
  agentName: string;
  taskId: string;
  taskTitle: string;
  taskNumber: number | null;
  startedAt: string;
  endedAt: string;
}

function fmt(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function WorkTimelinePage() {
  const [{ data, fetching }] = useQuery<{ workTimeline: Entry[] }>({
    query: WORK_TIMELINE_QUERY,
    variables: { limit: 300 },
  });
  const entries = useMemo(() => data?.workTimeline ?? [], [data]);

  const items = useMemo(
    () =>
      entries.map((e) => ({
        id: e.id,
        startMs: new Date(e.startedAt).getTime(),
        endMs: new Date(e.endedAt).getTime(),
      })),
    [entries],
  );
  const window = useMemo(() => timelineWindow(items), [items]);
  const barsById = useMemo(() => {
    const bars = computeTimelineBars(items, { fromMs: window.fromMs, toMs: window.toMs });
    return new Map(bars.map((b) => [b.id, b]));
  }, [items, window]);

  // Group by agent (the lens), preserving first-seen order.
  const byAgent = useMemo(() => {
    const groups = new Map<string, { name: string; entries: Entry[] }>();
    for (const e of entries) {
      const g = groups.get(e.agentId) ?? { name: e.agentName, entries: [] };
      g.entries.push(e);
      groups.set(e.agentId, g);
    }
    return [...groups.entries()];
  }, [entries]);

  return (
    <PageLayout maxWidth="wide">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Work timeline</h1>
        <p className="text-sm text-muted-foreground">
          Completed agent work across the workspace, by agent.
        </p>
      </div>

      {fetching && entries.length === 0 ? (
        <div className="flex justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No completed work sessions yet.
        </Card>
      ) : (
        <Card padding="lg" className="space-y-3">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{fmt(window.fromMs)}</span>
            <span>{fmt(window.toMs)}</span>
          </div>
          <div className="space-y-2">
            {byAgent.map(([agentId, group]) => (
              <div key={agentId} className="flex items-center gap-3">
                <span className="w-28 flex-shrink-0 truncate text-sm font-medium text-foreground">
                  {group.name}
                </span>
                <div className="relative h-7 flex-1 rounded bg-muted/50">
                  {group.entries.map((e) => {
                    const bar = barsById.get(e.id);
                    if (!bar) return null;
                    return (
                      <a
                        key={e.id}
                        href={`/task/${e.taskId}`}
                        title={`${e.taskNumber ? `#${e.taskNumber} ` : ""}${e.taskTitle} · ${fmt(
                          new Date(e.startedAt).getTime(),
                        )}`}
                        className="absolute top-1 flex h-5 items-center overflow-hidden rounded bg-indigo-500/80 px-1 text-[10px] text-white hover:bg-indigo-600"
                        style={{ left: `${bar.leftPct}%`, width: `${bar.widthPct}%` }}
                      >
                        <span className="truncate">{e.taskTitle}</span>
                      </a>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </PageLayout>
  );
}
