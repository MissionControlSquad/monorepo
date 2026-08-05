import { describe, it, expect } from "vitest";
import { loadRoleSkill, resolveRoleTemplateId } from "../../src/server/services/agent-role-skill";

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

  it("derives the specific role template from a free-text role (no templateId needed)", () => {
    expect(loadRoleSkill(null, "Backend Developer")!.key).toBe("role:backend-dev");
    expect(loadRoleSkill(null, "QA Engineer")!.key).toBe("role:qa-testing");
    expect(loadRoleSkill(null, "Squad Lead")!.key).toBe("role:squad-lead");
    expect(loadRoleSkill(null, "DevOps")!.key).toBe("role:devops");
  });

  it("falls back to a generic role guide when no template matches (still cloud-served, not local)", () => {
    const skill = loadRoleSkill(null, "Underwater Basket Weaver");
    expect(skill).not.toBeNull();
    expect(skill!.key).toBe("role:generic");
    expect(skill!.markdown).toContain("Underwater Basket Weaver");
  });

  it("rejects unsafe template ids (path traversal) → falls back / resolves by role", () => {
    // unsafe id ignored; role "Engineer" has no exact template → generic
    expect(loadRoleSkill("../../etc/passwd", "Engineer")!.key).toBe("role:generic");
  });

  it("resolveRoleTemplateId maps common roles and returns null for unknown", () => {
    expect(resolveRoleTemplateId("Frontend Developer")).toBe("frontend-dev");
    expect(resolveRoleTemplateId("Underwater Basket Weaver")).toBeNull();
  });

  it("returns null only when the agent has no role", () => {
    expect(loadRoleSkill("frontend-dev", null)).toBeNull();
  });
});
