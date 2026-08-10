import { describe, it, expect } from "vitest";
import {
  BOARD_PRINCIPAL_ROLES,
  canBoardPrincipalAct,
  describeBoardRole,
  normalizeBoardRole,
} from "@agentcenter/utils";

// Board-authz (Paperclip board authorization) — pure role → permission logic.
describe("board-authz", () => {
  it("chair and member can post + rate + read; observer is read-only", () => {
    for (const role of ["chair", "member"] as const) {
      expect(canBoardPrincipalAct(role, "read_thread")).toBe(true);
      expect(canBoardPrincipalAct(role, "post_message")).toBe(true);
      expect(canBoardPrincipalAct(role, "rate_message")).toBe(true);
    }
    expect(canBoardPrincipalAct("observer", "read_thread")).toBe(true);
    expect(canBoardPrincipalAct("observer", "post_message")).toBe(false);
    expect(canBoardPrincipalAct("observer", "rate_message")).toBe(false);
  });

  it("an unknown/empty role is fail-closed to observer (read-only)", () => {
    expect(normalizeBoardRole("wizard")).toBe("observer");
    expect(normalizeBoardRole(null)).toBe("observer");
    expect(canBoardPrincipalAct("wizard", "post_message")).toBe(false);
    expect(canBoardPrincipalAct(undefined, "read_thread")).toBe(true);
  });

  it("exposes the known roles and human-readable descriptions", () => {
    expect(BOARD_PRINCIPAL_ROLES).toEqual(["chair", "member", "observer"]);
    for (const role of BOARD_PRINCIPAL_ROLES) {
      expect(describeBoardRole(role)).toMatch(/read/i);
    }
  });
});
