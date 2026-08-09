import { describe, it, expect } from "vitest";
import {
  AI_RUNTIME_TOOLS,
  NODE_PREREQ,
  RUNTIME_OSES,
  osFromPlatform,
  getRuntimeTool,
  installMethodsFor,
  recommendedInstall,
  needsNode,
  type RuntimeOs,
} from "@agentcenter/utils";

describe("osFromPlatform", () => {
  it("maps Node platform strings to our OS enum", () => {
    expect(osFromPlatform("darwin")).toBe("macos");
    expect(osFromPlatform("win32")).toBe("windows");
    expect(osFromPlatform("linux")).toBe("linux");
    expect(osFromPlatform("freebsd")).toBe("linux"); // any other unix-like -> linux instructions
  });
});

describe("AI runtime catalog", () => {
  it("covers the adapter runtimes with a bin + docs + summary", () => {
    const keys = AI_RUNTIME_TOOLS.map((t) => t.key);
    for (const k of ["claude", "codex", "gemini", "cursor", "opencode", "grok", "pi", "openclaw"]) {
      expect(keys).toContain(k);
    }
    for (const t of AI_RUNTIME_TOOLS) {
      expect(t.binName).toBeTruthy();
      expect(t.versionArgs.length).toBeGreaterThan(0);
      expect(t.docsUrl).toMatch(/^https:\/\//);
      expect(t.summary).toBeTruthy();
      expect(t.installMethods.length).toBeGreaterThan(0);
    }
  });

  it("getRuntimeTool looks up by key", () => {
    expect(getRuntimeTool("claude")?.binName).toBe("claude");
    expect(getRuntimeTool("cursor")?.binName).toBe("cursor-agent");
    expect(getRuntimeTool("nope")).toBeUndefined();
  });

  it("every tool has at least one applicable install method on every OS", () => {
    for (const os of RUNTIME_OSES) {
      for (const t of AI_RUNTIME_TOOLS) {
        const methods = installMethodsFor(t, os);
        expect(methods.length, `${t.key} on ${os}`).toBeGreaterThan(0);
        const rec = recommendedInstall(t, os);
        expect(rec, `${t.key} on ${os} recommended`).not.toBeNull();
        expect(rec!.command).toBeTruthy();
      }
    }
  });

  it("orders methods OS-specific-recommended first, then any, no em dashes in notes", () => {
    const claudeMac = installMethodsFor(getRuntimeTool("claude")!, "macos");
    // native installer (macos, recommended) is first
    expect(claudeMac[0].label).toMatch(/native/i);
    expect(claudeMac[0].os).toBe("macos");
    // the npm "any" fallback comes after OS-specific ones
    const npmIdx = claudeMac.findIndex((m) => m.label.includes("npm"));
    expect(npmIdx).toBeGreaterThan(0);
    for (const t of AI_RUNTIME_TOOLS) {
      for (const m of t.installMethods) {
        expect(m.note ?? "", `${t.key} note`).not.toContain("—"); // em dash
        expect(m.command).not.toContain("—");
      }
    }
  });

  it("npm-based methods declare the node prerequisite", () => {
    const grokNpm = installMethodsFor(getRuntimeTool("grok")!, "linux").find((m) =>
      m.command.startsWith("npm"),
    );
    expect(grokNpm?.needs).toBe("node");
    // grok is npm-only, so it needs node on every OS
    for (const os of RUNTIME_OSES)
      expect(needsNode(getRuntimeTool("grok")!, os as RuntimeOs)).toBe(true);
    // claude has a native installer, so it does NOT strictly need node on macos
    expect(needsNode(getRuntimeTool("claude")!, "macos")).toBe(false);
  });

  it("Node prerequisite itself is installable per OS", () => {
    expect(NODE_PREREQ.binName).toBe("node");
    for (const os of RUNTIME_OSES) {
      expect(installMethodsFor(NODE_PREREQ, os).length).toBeGreaterThan(0);
    }
  });
});
