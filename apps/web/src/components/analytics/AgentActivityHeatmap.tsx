"use client";

import { useState, useMemo } from "react";
import { useQuery } from "urql";
import { AGENT_ACTIVITY_HEATMAP_QUERY } from "../../lib/graphql/queries";
import { ChartCard } from "./ChartCard";
import { useCurrentProject } from "../context/AppContext";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR_LABELS = Array.from({ length: 8 }, (_, i) => i * 3); // 0,3,6,...,21

const COLORS = [
  "bg-neutral-100", // 0 — no activity
  "bg-emerald-200", // quartile 1
  "bg-emerald-400", // quartile 2
  "bg-emerald-600", // quartile 3
  "bg-emerald-800", // quartile 4
];

function getColorIndex(count: number, thresholds: number[]): number {
  if (count === 0) return 0;
  if (count <= thresholds[0]) return 1;
  if (count <= thresholds[1]) return 2;
  if (count <= thresholds[2]) return 3;
  return 4;
}

function computeThresholds(counts: number[]): number[] {
  const nonZero = counts.filter((c) => c > 0).sort((a, b) => a - b);
  if (nonZero.length === 0) return [1, 2, 3];
  const q = (p: number) => nonZero[Math.min(Math.floor(p * nonZero.length), nonZero.length - 1)];
  return [q(0.25), q(0.5), q(0.75)];
}

type HeatmapCell = { dayOfWeek: number; hour: number; count: number };

export function AgentActivityHeatmap() {
  const { projectId } = useCurrentProject();
  const [result] = useQuery({
    query: AGENT_ACTIVITY_HEATMAP_QUERY,
    variables: { days: 28, projectId: projectId ?? undefined },
    requestPolicy: "cache-and-network",
  });
  const cells: HeatmapCell[] | undefined = result.data?.agentActivityHeatmap;

  const [tooltip, setTooltip] = useState<{
    day: number;
    hour: number;
    count: number;
    x: number;
    y: number;
  } | null>(null);

  const { grid, thresholds } = useMemo(() => {
    // Build 7×24 grid
    const g: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    if (cells) {
      for (const c of cells) {
        g[c.dayOfWeek][c.hour] = c.count;
      }
    }
    const allCounts = g.flat();
    return { grid: g, thresholds: computeThresholds(allCounts) };
  }, [cells]);

  return (
    <ChartCard title="Agent Activity Heatmap (4 weeks)" loading={!cells}>
      {cells && cells.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">No data yet</p>
      ) : (
        <div className="relative">
          <div className="flex">
            {/* Y-axis labels */}
            <div className="flex flex-col justify-between pr-2 pt-6 pb-0">
              {DAY_LABELS.map((d) => (
                <span
                  key={d}
                  className="text-[11px] text-muted-foreground h-5 flex items-center leading-none"
                >
                  {d}
                </span>
              ))}
            </div>

            {/* Grid */}
            <div className="flex-1 min-w-0">
              {/* X-axis labels */}
              <div
                className="grid grid-cols-24 gap-px mb-1"
                style={{ gridTemplateColumns: "repeat(24, 1fr)" }}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <span
                    key={h}
                    className="text-[10px] text-muted-foreground text-center leading-none"
                  >
                    {HOUR_LABELS.includes(h) ? `${h.toString().padStart(2, "0")}` : ""}
                  </span>
                ))}
              </div>

              {/* Heatmap cells */}
              <div className="grid gap-px" style={{ gridTemplateColumns: "repeat(24, 1fr)" }}>
                {grid.map((row, dayIdx) =>
                  row.map((count, hourIdx) => {
                    const colorIdx = getColorIndex(count, thresholds);
                    return (
                      <div
                        key={`${dayIdx}-${hourIdx}`}
                        className={`aspect-square rounded-sm ${COLORS[colorIdx]} cursor-pointer transition-opacity hover:opacity-80`}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const parentRect = e.currentTarget
                            .closest(".relative")!
                            .getBoundingClientRect();
                          setTooltip({
                            day: dayIdx,
                            hour: hourIdx,
                            count,
                            x: rect.left - parentRect.left + rect.width / 2,
                            y: rect.top - parentRect.top - 4,
                          });
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    );
                  }),
                )}
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-end gap-1.5 mt-3">
            <span className="text-[11px] text-muted-foreground mr-1">Less</span>
            {COLORS.map((c, i) => (
              <div key={i} className={`w-3 h-3 rounded-sm ${c}`} />
            ))}
            <span className="text-[11px] text-muted-foreground ml-1">More</span>
          </div>

          {/* Tooltip */}
          {tooltip && (
            <div
              className="absolute z-10 pointer-events-none bg-foreground text-white text-xs rounded-md px-2.5 py-1.5 whitespace-nowrap -translate-x-1/2 -translate-y-full"
              style={{ left: tooltip.x, top: tooltip.y }}
            >
              {DAY_LABELS[tooltip.day]} {tooltip.hour.toString().padStart(2, "0")}:00 —{" "}
              {tooltip.count} action{tooltip.count !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      )}
    </ChartCard>
  );
}
