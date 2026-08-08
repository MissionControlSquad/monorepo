import { describe, it, expect } from "vitest";
import { reconcileAgentSkills, adapterSkillMode, applySkillMergeMode } from "@agentcenter/utils";

describe("adapterSkillMode", () => {
  it("maps known adapters to a mode, unknown → unsupported", () => {
    expect(adapterSkillMode("claude")).toBe("persistent");
    expect(adapterSkillMode("codex")).toBe("ephemeral");
    expect(adapterSkillMode("shell")).toBe("unsupported");
    expect(adapterSkillMode(null)).toBe("unsupported");
  });
});

describe("reconcileAgentSkills (#F22)", () => {
  it("persistent: installed / stale / missing", () => {
    const r = reconcileAgentSkills(
      [
        { skillId: "s1", version: 2 },
        { skillId: "s2", version: 3 },
        { skillId: "s3", version: 1 },
      ],
      [
        { skillId: "s1", installedVersion: 2 }, // matches → installed
        { skillId: "s2", installedVersion: 1 }, // behind → stale
      ],
      "persistent",
    );
    const byId = Object.fromEntries(r.entries.map((e) => [e.skillId, e.state]));
    expect(byId).toEqual({ s1: "installed", s2: "stale", s3: "missing" });
  });

  it("ephemeral: an absent desired skill is 'configured' (materialized per run)", () => {
    const r = reconcileAgentSkills([{ skillId: "s1", version: 1 }], [], "ephemeral");
    expect(r.entries[0].state).toBe("configured");
  });

  it("actual-but-not-desired → external", () => {
    const r = reconcileAgentSkills([], [{ skillId: "x", installedVersion: 1 }], "persistent");
    expect(r.entries[0]).toMatchObject({ skillId: "x", state: "external" });
  });

  it("unsupported adapter: all actual are external + a warning for ignored desired", () => {
    const r = reconcileAgentSkills(
      [{ skillId: "s1", version: 1 }],
      [{ skillId: "x", installedVersion: 1 }],
      "unsupported",
    );
    expect(r.entries).toEqual([
      { skillId: "x", state: "external", desiredVersion: null, actualVersion: 1 },
    ]);
    expect(r.warnings[0]).toMatch(/does not support managed skills/);
  });
});

describe("applySkillMergeMode (#10978 explicit merge modes)", () => {
  const current = [
    { skillId: "s1", pinnedVersion: 1 },
    { skillId: "s2", pinnedVersion: null },
  ];

  it("replace: the requested set becomes the whole desired set (current is discarded)", () => {
    const out = applySkillMergeMode(current, [{ skillId: "s3", pinnedVersion: 2 }], "replace");
    expect(out).toEqual([{ skillId: "s3", pinnedVersion: 2 }]);
  });

  it("add: unions current with requested (non-destructive), requested wins on conflict", () => {
    const out = applySkillMergeMode(
      current,
      [
        { skillId: "s2", pinnedVersion: 5 }, // re-pins existing s2
        { skillId: "s3", pinnedVersion: 2 }, // brand new
      ],
      "add",
    );
    expect(out).toEqual([
      { skillId: "s1", pinnedVersion: 1 },
      { skillId: "s2", pinnedVersion: 5 },
      { skillId: "s3", pinnedVersion: 2 },
    ]);
  });

  it("remove: deletes only the requested keys, leaving the rest untouched", () => {
    const out = applySkillMergeMode(current, [{ skillId: "s1" }], "remove");
    expect(out).toEqual([{ skillId: "s2", pinnedVersion: null }]);
  });

  it("remove ignores requested versions and unknown keys", () => {
    const out = applySkillMergeMode(current, [{ skillId: "nope", pinnedVersion: 9 }], "remove");
    expect(out).toEqual(current);
  });

  it("add onto an empty current is just the requested set", () => {
    expect(applySkillMergeMode([], [{ skillId: "s1", pinnedVersion: 1 }], "add")).toEqual([
      { skillId: "s1", pinnedVersion: 1 },
    ]);
  });
});
