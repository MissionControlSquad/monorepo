/**
 * Work-timeline (Gantt) layout — shared pure geometry. Import from @agentcenter/utils. Given work
 * spans and a visible window, computes each bar's horizontal position as a percentage so the same
 * math drives web/desktop/mobile Gantt views. No I/O.
 */

export interface TimelineItem {
  id: string;
  startMs: number;
  endMs: number;
}

export interface TimelineBar extends TimelineItem {
  leftPct: number;
  widthPct: number;
}

/** Pure: bounding window [min start, max end] of the items (0,0 for empty). */
export function timelineWindow(items: TimelineItem[]): { fromMs: number; toMs: number } {
  if (items.length === 0) return { fromMs: 0, toMs: 0 };
  let fromMs = Infinity;
  let toMs = -Infinity;
  for (const it of items) {
    fromMs = Math.min(fromMs, it.startMs);
    toMs = Math.max(toMs, it.endMs);
  }
  return { fromMs, toMs };
}

/**
 * Pure: position each item as a bar within [fromMs, toMs]. Bars are clamped to the window; anything
 * fully outside is dropped. A zero-width window (all items at one instant) lays everything full-width.
 * `minWidthPct` guarantees a sub-second span is still visible.
 */
export function computeTimelineBars(
  items: TimelineItem[],
  opts: { fromMs: number; toMs: number; minWidthPct?: number },
): TimelineBar[] {
  const { fromMs, toMs } = opts;
  const minWidthPct = opts.minWidthPct ?? 0.5;
  const span = toMs - fromMs;
  const bars: TimelineBar[] = [];
  for (const it of items) {
    const start = Math.max(it.startMs, fromMs);
    const end = Math.min(it.endMs, toMs);
    if (end < fromMs || start > toMs) continue; // fully outside
    if (span <= 0) {
      bars.push({ ...it, leftPct: 0, widthPct: 100 });
      continue;
    }
    const leftPct = ((start - fromMs) / span) * 100;
    const widthPct = Math.max(((end - start) / span) * 100, minWidthPct);
    bars.push({ ...it, leftPct, widthPct: Math.min(widthPct, 100 - leftPct) });
  }
  return bars;
}
