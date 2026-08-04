import { describe, it, expect } from "vitest";
import {
  toPortablePath,
  isAbsolutePortable,
  joinPortable,
  normalizePortable,
} from "@agentcenter/utils";

describe("portable-path (parity #130)", () => {
  it("toPortablePath converts backslashes + collapses separators", () => {
    expect(toPortablePath("a\\b\\c")).toBe("a/b/c");
    expect(toPortablePath("a//b///c")).toBe("a/b/c");
  });
  it("isAbsolutePortable detects POSIX + Windows absolutes", () => {
    expect(isAbsolutePortable("/x/y")).toBe(true);
    expect(isAbsolutePortable("C:\\x")).toBe(true);
    expect(isAbsolutePortable("C:/x")).toBe(true);
    expect(isAbsolutePortable("a/b")).toBe(false);
  });
  it("joinPortable joins + normalizes separators, preserving a leading slash", () => {
    expect(joinPortable("a", "b", "c")).toBe("a/b/c");
    expect(joinPortable("/root", "/sub/", "file")).toBe("/root/sub/file");
    expect(joinPortable("a\\b", "c")).toBe("a/b/c");
  });
  it("normalizePortable resolves . and .. safely", () => {
    expect(normalizePortable("a/./b/../c")).toBe("a/c");
    expect(normalizePortable("/a/b/../../c")).toBe("/c");
    expect(normalizePortable("/a/../../x")).toBe("/x"); // .. cannot escape an absolute root
    expect(normalizePortable("../a/../b")).toBe("../b"); // relative .. is kept
    expect(normalizePortable("C:\\a\\..\\b")).toBe("C:/b");
    expect(normalizePortable(".")).toBe(".");
  });
});
