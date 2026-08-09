import { describe, it, expect } from "vitest";
import { computeTimelineBars, timelineWindow } from "@agentcenter/utils";

describe("timelineWindow", () => {
  it("returns the min start / max end (0,0 for empty)", () => {
    expect(timelineWindow([])).toEqual({ fromMs: 0, toMs: 0 });
    expect(
      timelineWindow([
        { id: "a", startMs: 100, endMs: 200 },
        { id: "b", startMs: 50, endMs: 400 },
      ]),
    ).toEqual({ fromMs: 50, toMs: 400 });
  });
});

describe("computeTimelineBars", () => {
  it("positions bars as percentages within the window", () => {
    const bars = computeTimelineBars(
      [
        { id: "a", startMs: 0, endMs: 500 },
        { id: "b", startMs: 500, endMs: 1000 },
      ],
      { fromMs: 0, toMs: 1000 },
    );
    expect(bars[0]).toMatchObject({ id: "a", leftPct: 0, widthPct: 50 });
    expect(bars[1]).toMatchObject({ id: "b", leftPct: 50, widthPct: 50 });
  });

  it("clamps overhanging bars and drops fully-outside items", () => {
    const bars = computeTimelineBars(
      [
        { id: "in", startMs: -100, endMs: 600 }, // clamps to 0..600
        { id: "out", startMs: 2000, endMs: 3000 }, // dropped
      ],
      { fromMs: 0, toMs: 1000 },
    );
    expect(bars.map((b) => b.id)).toEqual(["in"]);
    expect(bars[0]).toMatchObject({ leftPct: 0, widthPct: 60 });
  });

  it("enforces a minimum width and a zero-span window lays full width", () => {
    const tiny = computeTimelineBars([{ id: "x", startMs: 100, endMs: 101 }], {
      fromMs: 0,
      toMs: 100000,
      minWidthPct: 1,
    });
    expect(tiny[0].widthPct).toBe(1);

    const zero = computeTimelineBars([{ id: "x", startMs: 5, endMs: 5 }], { fromMs: 5, toMs: 5 });
    expect(zero[0]).toMatchObject({ leftPct: 0, widthPct: 100 });
  });
});
