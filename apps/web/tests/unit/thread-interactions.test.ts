import { describe, it, expect } from "vitest";
import {
  isThreadInteractionKind,
  isThreadInteractionStatus,
  canResolveThreadInteraction,
  resolutionWakesRun,
} from "@agentcenter/utils";

describe("thread-interactions vocabulary (Domain 8 G6.5)", () => {
  it("validates kinds + statuses", () => {
    for (const k of ["suggest_tasks", "ask_user_questions", "request_confirmation"]) {
      expect(isThreadInteractionKind(k)).toBe(true);
    }
    expect(isThreadInteractionKind("nope")).toBe(false);
    expect(isThreadInteractionStatus("pending")).toBe(true);
    expect(isThreadInteractionStatus("resolved")).toBe(true);
    expect(isThreadInteractionStatus("bogus")).toBe(false);
  });

  it("only a pending interaction can be resolved or dismissed", () => {
    expect(canResolveThreadInteraction("pending", "resolved")).toBe(true);
    expect(canResolveThreadInteraction("pending", "dismissed")).toBe(true);
    expect(canResolveThreadInteraction("resolved", "dismissed")).toBe(false);
    expect(canResolveThreadInteraction("dismissed", "resolved")).toBe(false);
  });

  it("resolving a request_confirmation wakes the run; other kinds/states do not", () => {
    expect(resolutionWakesRun("request_confirmation", "resolved")).toBe(true);
    expect(resolutionWakesRun("request_confirmation", "dismissed")).toBe(false);
    expect(resolutionWakesRun("ask_user_questions", "resolved")).toBe(false);
  });
});
