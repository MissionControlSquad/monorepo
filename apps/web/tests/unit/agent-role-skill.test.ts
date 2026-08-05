import { describe, it, expect } from "vitest";
import { loadRoleSkill } from "../../src/server/services/agent-role-skill";

// Cloud-served role skills: an agent's role skill guide comes from the control plane's template
// library (server-side files), not local bundle files — so the agent runs correctly in any
// environment. These tests pin that behavior.
describe("loadRoleSkill (cloud-served role skills)", () => {
  it("serves a specific role template from the server library, with identity vars rendered", () => {
    const skill = loadRoleSkill("frontend-dev", "Frontend Developer", "Rex");
    expect(skill).not.toBeNull();
    expect(skill!.key).toBe("role:frontend-dev");
    expect(skill!.name).toBe("Frontend Developer Guide");
    expect(skill!.markdown.length).toBeGreaterThan(50);
    // identity template vars are rendered, not left raw
    expect(skill!.markdown).not.toContain("{{agent.role}}");
    expect(skill!.markdown).not.toContain("{{agent.name}}");
  });

  it("falls back to a generic role guide when no template matches (still cloud-served, not local)", () => {
    const skill = loadRoleSkill(null, "Squad Lead");
    expect(skill).not.toBeNull();
    expect(skill!.key).toBe("role:generic");
    expect(skill!.markdown).toContain("Squad Lead");
  });

  it("rejects unsafe template ids (path traversal) → falls back", () => {
    const skill = loadRoleSkill("../../etc/passwd", "Engineer");
    expect(skill!.key).toBe("role:generic");
  });

  it("returns null only when the agent has no role", () => {
    expect(loadRoleSkill("frontend-dev", null)).toBeNull();
  });
});
