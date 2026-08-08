import { describe, expect, it } from "vitest";
import {
  AGENT_DETAIL_TABS,
  DEFAULT_AGENT_DETAIL_TAB,
  buildAgentDetailHref,
  buildAgentDetailQuery,
  isAgentDetailTab,
  resolveAgentDetailTab,
  selectRunDetail,
} from "@/views/agent-detail/agent-detail-tabs";

describe("resolveAgentDetailTab", () => {
  it("defaults to overview for null/empty/whitespace", () => {
    expect(resolveAgentDetailTab(null)).toBe("overview");
    expect(resolveAgentDetailTab(undefined)).toBe("overview");
    expect(resolveAgentDetailTab("")).toBe("overview");
    expect(resolveAgentDetailTab("   ")).toBe("overview");
    expect(DEFAULT_AGENT_DETAIL_TAB).toBe("overview");
  });

  it("accepts every known tab, case-insensitively", () => {
    for (const tab of AGENT_DETAIL_TABS) {
      expect(resolveAgentDetailTab(tab)).toBe(tab);
      expect(resolveAgentDetailTab(tab.toUpperCase())).toBe(tab);
      expect(resolveAgentDetailTab(`  ${tab}  `)).toBe(tab);
    }
  });

  it("maps legacy aliases onto real tabs", () => {
    expect(resolveAgentDetailTab("run")).toBe("runs");
    expect(resolveAgentDetailTab("tool")).toBe("tools");
    expect(resolveAgentDetailTab("configuration")).toBe("settings");
    expect(resolveAgentDetailTab("config")).toBe("settings");
    expect(resolveAgentDetailTab("edit")).toBe("settings");
    expect(resolveAgentDetailTab("dashboard")).toBe("overview");
  });

  it("falls back to overview for unknown values", () => {
    expect(resolveAgentDetailTab("nonsense")).toBe("overview");
    expect(resolveAgentDetailTab("../../etc")).toBe("overview");
  });
});

describe("isAgentDetailTab", () => {
  it("guards known vs unknown", () => {
    expect(isAgentDetailTab("runs")).toBe(true);
    expect(isAgentDetailTab("tools")).toBe(true);
    expect(isAgentDetailTab("bogus")).toBe(false);
    expect(isAgentDetailTab(null)).toBe(false);
    expect(isAgentDetailTab(undefined)).toBe(false);
  });
});

interface FakeRun {
  id: string;
  status: string;
}

const runs: FakeRun[] = [
  { id: "run_a", status: "running" },
  { id: "run_b", status: "done" },
];

describe("selectRunDetail", () => {
  it("returns list mode when no run id is requested", () => {
    const sel = selectRunDetail(null, runs);
    expect(sel.mode).toBe("list");
    expect(sel.runId).toBeNull();
    expect(sel.run).toBeNull();
    expect(sel.notFound).toBe(false);
  });

  it("treats empty/whitespace run param as list mode", () => {
    expect(selectRunDetail("", runs).mode).toBe("list");
    expect(selectRunDetail("   ", runs).mode).toBe("list");
  });

  it("selects the matching run in detail mode", () => {
    const sel = selectRunDetail("run_b", runs);
    expect(sel.mode).toBe("detail");
    expect(sel.runId).toBe("run_b");
    expect(sel.run).toEqual({ id: "run_b", status: "done" });
    expect(sel.notFound).toBe(false);
  });

  it("trims the run param before matching", () => {
    const sel = selectRunDetail("  run_a  ", runs);
    expect(sel.run?.id).toBe("run_a");
    expect(sel.runId).toBe("run_a");
  });

  it("flags detail mode + notFound when the run is not yet loaded", () => {
    expect(selectRunDetail("run_x", runs)).toMatchObject({
      mode: "detail",
      runId: "run_x",
      run: null,
      notFound: true,
    });
    expect(selectRunDetail("run_x", null)).toMatchObject({ mode: "detail", notFound: true });
    expect(selectRunDetail("run_x", []).notFound).toBe(true);
  });
});

describe("buildAgentDetailQuery / buildAgentDetailHref", () => {
  it("collapses the default overview tab to a bare path", () => {
    expect(buildAgentDetailQuery("overview")).toBe("");
    expect(buildAgentDetailHref("agent1", "overview")).toBe("/agents/agent1");
  });

  it("emits ?tab= for non-default tabs", () => {
    expect(buildAgentDetailQuery("tools")).toBe("?tab=tools");
    expect(buildAgentDetailHref("agent1", "tasks")).toBe("/agents/agent1?tab=tasks");
  });

  it("adds the run deep-link only on the runs tab", () => {
    expect(buildAgentDetailQuery("runs", "run_a")).toBe("?tab=runs&run=run_a");
    expect(buildAgentDetailHref("agent1", "runs", "run_a")).toBe(
      "/agents/agent1?tab=runs&run=run_a",
    );
    // run id is ignored for non-runs tabs
    expect(buildAgentDetailQuery("tools", "run_a")).toBe("?tab=tools");
    // blank run id is dropped
    expect(buildAgentDetailQuery("runs", "   ")).toBe("?tab=runs");
    expect(buildAgentDetailQuery("runs", null)).toBe("?tab=runs");
  });

  it("round-trips through resolveAgentDetailTab", () => {
    for (const tab of AGENT_DETAIL_TABS) {
      const href = buildAgentDetailHref("a", tab);
      const query = href.split("?")[1] ?? "";
      const parsed = new URLSearchParams(query).get("tab");
      expect(resolveAgentDetailTab(parsed)).toBe(tab);
    }
  });
});
