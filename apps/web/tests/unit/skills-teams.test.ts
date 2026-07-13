import { describe, it, expect } from "vitest";
import { slugify } from "@/server/services/skills";
import { resolveCollision } from "@agentcenter/utils";

describe("slugify", () => {
  it("lowercases + hyphenates + trims", () => {
    expect(slugify("  Deploy to Prod!  ")).toBe("deploy-to-prod");
    expect(slugify("A/B Testing")).toBe("a-b-testing");
  });
  it("falls back to 'skill' for empty input", () => {
    expect(slugify("!!!")).toBe("skill");
  });
});

describe("resolveCollision (team install)", () => {
  it("no collision → create with the same name", () => {
    expect(resolveCollision(["Bob"], "Alice", "rename")).toEqual({
      action: "create",
      name: "Alice",
    });
  });
  it("skip strategy → skip", () => {
    expect(resolveCollision(["Alice"], "Alice", "skip")).toEqual({ action: "skip", name: "Alice" });
  });
  it("replace strategy → replace", () => {
    expect(resolveCollision(["Alice"], "Alice", "replace")).toEqual({
      action: "replace",
      name: "Alice",
    });
  });
  it("rename strategy → first free -N suffix", () => {
    expect(resolveCollision(["Alice"], "Alice", "rename")).toEqual({
      action: "create",
      name: "Alice-2",
    });
    expect(resolveCollision(["Alice", "Alice-2"], "Alice", "rename")).toEqual({
      action: "create",
      name: "Alice-3",
    });
  });
});
