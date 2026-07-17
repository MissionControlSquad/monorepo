import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The loop calls drainSandboxRunQueue on a timer; we mock it to assert scheduling + non-overlap
// without touching the DB. Uses fake timers.
const drainMock = vi.fn<() => Promise<number>>();
vi.mock("../../src/server/services/sandbox-run", () => ({
  drainSandboxRunQueue: () => drainMock(),
}));

import {
  startSandboxDrainLoop,
  stopSandboxDrainLoop,
} from "../../src/server/services/sandbox-drain-loop";

describe("sandbox drain loop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    drainMock.mockReset();
    drainMock.mockResolvedValue(0);
  });
  afterEach(() => {
    stopSandboxDrainLoop();
    vi.useRealTimers();
  });

  it("drains on each interval tick", async () => {
    startSandboxDrainLoop();
    expect(drainMock).not.toHaveBeenCalled(); // nothing before the first tick
    await vi.advanceTimersByTimeAsync(15_000);
    expect(drainMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(drainMock).toHaveBeenCalledTimes(2);
  });

  it("never overlaps a slow drain (a still-running drain skips the next tick)", async () => {
    let release!: () => void;
    drainMock.mockImplementationOnce(() => new Promise<number>((res) => (release = () => res(0))));
    startSandboxDrainLoop();

    await vi.advanceTimersByTimeAsync(15_000); // tick 1 → drain starts, stays pending
    expect(drainMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_000); // tick 2 → skipped, prior drain still in flight
    expect(drainMock).toHaveBeenCalledTimes(1);

    release(); // first drain finishes
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(15_000); // tick 3 → runs again now that the guard cleared
    expect(drainMock).toHaveBeenCalledTimes(2);
  });

  it("is idempotent — a second start does not double the cadence", async () => {
    startSandboxDrainLoop();
    startSandboxDrainLoop();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(drainMock).toHaveBeenCalledTimes(1);
  });
});
