import { describe, it, expect } from "vitest";
import { humanizeSystemNotice, isSystemNotice } from "../../src/lib/system-notice-humanizer";

describe("humanizeSystemNotice", () => {
  it("classifies a completed sandbox run (done) as success", () => {
    const result = humanizeSystemNotice("Sandbox run (e2b) — done, exit 0\n\nAll tests passed.");
    expect(result).toMatchObject({
      kind: "run_completed",
      title: "Run completed",
      tone: "success",
      icon: "check-circle",
    });
    expect(result?.detail).toBe("e2b");
  });

  it("classifies a completed run by exit 0 even when status is not 'done'", () => {
    const result = humanizeSystemNotice("Sandbox run (daytona) — review, exit 0\n\nok");
    expect(result?.kind).toBe("run_completed");
    expect(result?.tone).toBe("success");
  });

  it("classifies a failed sandbox run as a warning with the exit code in detail", () => {
    const result = humanizeSystemNotice("Sandbox run (e2b) — failed, exit 1\n\n[stderr]\nboom");
    expect(result).toMatchObject({
      kind: "run_failed",
      title: "Run failed",
      tone: "warning",
      icon: "alert-triangle",
    });
    expect(result?.detail).toContain("exit 1");
  });

  it("classifies a timed-out sandbox run", () => {
    const result = humanizeSystemNotice("Sandbox run (e2b) — timeout\n\n(no output)");
    expect(result).toMatchObject({
      kind: "run_timed_out",
      title: "Run timed out",
      tone: "warning",
      icon: "clock",
    });
  });

  it("classifies a provision error ('failed: <message>')", () => {
    const result = humanizeSystemNotice("Sandbox run (e2b) failed: provider quota exceeded");
    expect(result).toMatchObject({
      kind: "run_error",
      title: "Run could not start",
      tone: "warning",
    });
    expect(result?.detail).toContain("provider quota exceeded");
  });

  it("classifies an agent-path task approval as success", () => {
    const result = humanizeSystemNotice("Task approved by @lead. Great work @dev!");
    expect(result).toMatchObject({
      kind: "task_approved",
      title: "Task approved",
      tone: "success",
    });
  });

  it("classifies a human-path approval ('**Approved** by ...')", () => {
    const result = humanizeSystemNotice("**Approved** by Dana — ship it.");
    expect(result?.kind).toBe("task_approved");
    expect(result?.tone).toBe("success");
  });

  it("classifies a rejection ('**Task rejected**') and surfaces the reason", () => {
    const result = humanizeSystemNotice(
      "**Task rejected** by @lead\n\n**Reason:** tests are missing\n\n**Changes needed:**\n1. add tests\n\n@dev please address these items.",
    );
    expect(result).toMatchObject({
      kind: "changes_requested",
      title: "Changes requested",
      tone: "warning",
    });
    expect(result?.detail).toBe("tests are missing");
  });

  it("classifies a human-path changes-requested notice", () => {
    const result = humanizeSystemNotice(
      "**Changes requested** by Dana\n\nPlease revise and resubmit.",
    );
    expect(result?.kind).toBe("changes_requested");
    expect(result?.tone).toBe("warning");
  });

  it("classifies a clarification request as info", () => {
    const result = humanizeSystemNotice(
      "**Clarification needed** from @lead\n\n**Questions:**\n1. which env?\n\n@dev please respond.",
    );
    expect(result).toMatchObject({
      kind: "clarification_requested",
      title: "Clarification requested",
      tone: "info",
      icon: "message-square",
    });
  });

  it("passes through an ordinary human chat message (unknown kind -> null)", () => {
    expect(humanizeSystemNotice("Hey, can you take a look at the PR?")).toBeNull();
  });

  it("passes through an empty / whitespace body", () => {
    expect(humanizeSystemNotice("")).toBeNull();
    expect(humanizeSystemNotice("   \n  ")).toBeNull();
    expect(humanizeSystemNotice(null)).toBeNull();
    expect(humanizeSystemNotice(undefined)).toBeNull();
  });

  it("truncates an over-long detail to <= 80 chars with an ellipsis", () => {
    const longReason = "x".repeat(200);
    const result = humanizeSystemNotice(`**Task rejected** by @lead\n\n**Reason:** ${longReason}`);
    expect(result?.detail).toBeDefined();
    expect(result!.detail!.length).toBeLessThanOrEqual(80);
    expect(result!.detail!.endsWith("…")).toBe(true);
  });
});

describe("isSystemNotice", () => {
  it("is true for recognized machine notices", () => {
    expect(isSystemNotice("Sandbox run (e2b) — done, exit 0")).toBe(true);
    expect(isSystemNotice("**Clarification needed** from @lead\n\n**Questions:**\n1. q")).toBe(
      true,
    );
  });

  it("is false for ordinary chat", () => {
    expect(isSystemNotice("looks good to me")).toBe(false);
  });
});
