import { describe, it, expect } from "vitest";
import {
  makeWorkspaceFileRef,
  formatWorkspaceFileRef,
  parseWorkspaceFileRef,
  resolveWorkspaceFilePath,
  WorkspaceFileRefError,
} from "@agentcenter/utils";

// Parity #172 — workspace_file resource refs.
describe("makeWorkspaceFileRef (#172)", () => {
  it("normalizes a relative path and keeps line/col", () => {
    const ref = makeWorkspaceFileRef({ relativePath: "./src\\app.ts", line: 12, col: 4 });
    expect(ref).toEqual({ kind: "workspace_file", relativePath: "src/app.ts", line: 12, col: 4 });
  });

  it("rejects absolute paths and root escapes", () => {
    expect(() => makeWorkspaceFileRef({ relativePath: "/etc/passwd" })).toThrow(
      WorkspaceFileRefError,
    );
    expect(() => makeWorkspaceFileRef({ relativePath: "C:\\win" })).toThrow(/absolute/);
    expect(() => makeWorkspaceFileRef({ relativePath: "../secrets" })).toThrow(/escape/);
    expect(() => makeWorkspaceFileRef({ relativePath: "a/../../b" })).toThrow(/escape/);
  });

  it("validates line/col are positive ints and col needs a line", () => {
    expect(() => makeWorkspaceFileRef({ relativePath: "a.ts", line: 0 })).toThrow(/line/);
    expect(() => makeWorkspaceFileRef({ relativePath: "a.ts", line: 1.5 })).toThrow(/line/);
    expect(() => makeWorkspaceFileRef({ relativePath: "a.ts", col: 3 })).toThrow(/col requires/);
  });
});

describe("format/parse round-trip", () => {
  it("formats path/line/col", () => {
    expect(formatWorkspaceFileRef(makeWorkspaceFileRef({ relativePath: "a.ts" }))).toBe("a.ts");
    expect(formatWorkspaceFileRef(makeWorkspaceFileRef({ relativePath: "a.ts", line: 5 }))).toBe(
      "a.ts:5",
    );
    expect(
      formatWorkspaceFileRef(makeWorkspaceFileRef({ relativePath: "a.ts", line: 5, col: 2 })),
    ).toBe("a.ts:5:2");
  });

  it("parses path:line:col back", () => {
    expect(parseWorkspaceFileRef("src/a.ts:10:3")).toMatchObject({
      relativePath: "src/a.ts",
      line: 10,
      col: 3,
    });
    expect(parseWorkspaceFileRef("src/a.ts")).toMatchObject({ relativePath: "src/a.ts" });
  });
});

describe("resolveWorkspaceFilePath", () => {
  it("joins against the checkout base", () => {
    const ref = makeWorkspaceFileRef({ relativePath: "src/a.ts", line: 3 });
    expect(resolveWorkspaceFilePath(ref, "/srv/proj")).toBe("/srv/proj/src/a.ts");
  });

  it("still refuses an escape that only appears after joining", () => {
    // relativePath is clean, but a malicious base+ref combination is re-checked post-join.
    const ref = { kind: "workspace_file" as const, relativePath: "../../etc/passwd" };
    expect(() => resolveWorkspaceFilePath(ref, "/srv/proj")).toThrow(/escapes/);
  });
});
