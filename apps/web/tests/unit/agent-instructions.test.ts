import { describe, it, expect } from "vitest";
import {
  isValidInstructionFileName,
  defaultBundleFor,
  DEFAULT_AGENTS_MD,
} from "@/server/services/agent-instructions";

// Epic #18: pure file-name validation + default bundles. No DB.

describe("isValidInstructionFileName", () => {
  it("accepts plain .md basenames", () => {
    for (const n of ["AGENTS.md", "HEARTBEAT.md", "notes.md", "a-b_c.md"]) {
      expect(isValidInstructionFileName(n)).toBe(true);
    }
  });
  it("rejects path separators and traversal", () => {
    for (const n of ["../secret.md", "a/b.md", "a\\b.md", "..md.."]) {
      expect(isValidInstructionFileName(n)).toBe(false);
    }
  });
  it("rejects non-.md and empty names", () => {
    expect(isValidInstructionFileName("notes.txt")).toBe(false);
    expect(isValidInstructionFileName("AGENTS")).toBe(false);
    expect(isValidInstructionFileName("")).toBe(false);
  });
  it("rejects an over-long name", () => {
    expect(isValidInstructionFileName("a".repeat(70) + ".md")).toBe(false);
  });
});

describe("defaultBundleFor", () => {
  it("gives the plain bundle for a normal role", () => {
    expect(defaultBundleFor("engineer")).toEqual(["AGENTS.md"]);
    expect(defaultBundleFor(null)).toEqual(["AGENTS.md"]);
  });
  it("gives the CEO bundle for a chief/ceo role", () => {
    expect(defaultBundleFor("CEO")).toEqual(["AGENTS.md", "HEARTBEAT.md", "SOUL.md", "TOOLS.md"]);
    expect(defaultBundleFor("Chief of Staff")).toContain("SOUL.md");
  });
});

describe("DEFAULT_AGENTS_MD", () => {
  it("is a non-trivial markdown starter", () => {
    expect(DEFAULT_AGENTS_MD).toContain("# AGENTS.md");
    expect(DEFAULT_AGENTS_MD.length).toBeGreaterThan(50);
  });
});
