import { describe, it, expect } from "vitest";
import {
  runSummaryPresentation,
  runErrorPresentation,
  statusChangePresentation,
  changesRequestedPresentation,
} from "../../src/server/services/message-presentation";

// Work-items §3 Item 2 — pure presentation builders. Same input → same shape; the UI switches on `kind`
// and `tone`, so those must be stable.
describe("message presentation builders", () => {
  it("run summary: clean exit reads as a success run card", () => {
    const p = runSummaryPresentation({
      provider: "e2b",
      status: "review",
      exitCode: 0,
      runId: "run_1",
    });
    expect(p).toMatchObject({
      kind: "run_summary",
      tone: "success",
      title: "Run completed",
      provider: "e2b",
      exitCode: 0,
      runId: "run_1",
    });
    expect(p.detail).toContain("e2b");
  });

  it("run summary: nonzero exit reads as a failure, timeout as a warning", () => {
    expect(
      runSummaryPresentation({ provider: "e2b", status: "failed", exitCode: 1 }),
    ).toMatchObject({ kind: "run_summary", tone: "warning", title: "Run failed" });
    expect(runSummaryPresentation({ provider: "e2b", status: "timeout" })).toMatchObject({
      tone: "warning",
      title: "Run timed out",
    });
  });

  it("run error: provision failure is a warning run card", () => {
    expect(runErrorPresentation({ provider: "modal", runId: "r" })).toMatchObject({
      kind: "run_summary",
      tone: "warning",
      title: "Run could not start",
      provider: "modal",
    });
  });

  it("status change: approval is a success, generic move is info", () => {
    expect(
      statusChangePresentation({ fromStatus: "review", toStatus: "done", approved: true }),
    ).toMatchObject({
      kind: "status_change",
      tone: "success",
      title: "Task approved",
      toStatus: "done",
    });
    expect(statusChangePresentation({ toStatus: "assigned" })).toMatchObject({
      kind: "status_change",
      tone: "info",
      title: "Status changed",
    });
  });

  it("changes requested is a warning status card carrying the reason", () => {
    expect(
      changesRequestedPresentation({ actor: "reviewer", reason: "tighten the copy" }),
    ).toMatchObject({ kind: "status_change", tone: "warning", detail: "tighten the copy" });
  });

  it("drops undefined keys so the persisted JSON stays compact", () => {
    const p = runSummaryPresentation({ provider: "e2b", status: "done" });
    expect(Object.prototype.hasOwnProperty.call(p, "runId")).toBe(false);
  });
});
