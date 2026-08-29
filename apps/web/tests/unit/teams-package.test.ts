import { describe, it, expect } from "vitest";
import {
  emitTeamMarkdown,
  parseTeamMarkdown,
  emitProjectMarkdown,
  parseProjectMarkdown,
  emitTaskMarkdown,
  parseTaskMarkdown,
  emitSkillMarkdown,
  parseSkillPackageMarkdown,
  parseCompanyPackageFiles,
  emitCompanyMarkdown,
  emitAgentMarkdown,
  sha256Hex,
  hashPackageFiles,
  parseSourceRef,
  formatSourceRef,
  verifyPackageIntegrity,
} from "@agentcenter/utils";

// Domain 14: the multi-kind portable package format (TEAM/PROJECT/TASK/SKILL) + pinned import refs.

describe("multi-kind emit/parse — byte-stable round-trip (emit(parse(emit(x))) === emit(x))", () => {
  it("TEAM.md round-trips including its Roles list", () => {
    const md = emitTeamMarkdown({
      name: "Launch Squad",
      slug: "launch-squad",
      description: "Ship it",
      icon: "🚀",
      tagline: "one install",
      author: "AgentCenter",
      tags: ["catalog", "launch"],
      members: [
        { name: "Squad Lead", role: "Squad Lead" },
        { name: "Frontend Development", role: "Frontend Developer" },
      ],
      sourceRef: "github:acme/co@abc123",
    });
    expect(md).toContain("kind: team");
    expect(md).toContain("- Squad Lead — Squad Lead");
    const parsed = parseTeamMarkdown(md)!;
    expect(parsed.members).toEqual([
      { name: "Squad Lead", role: "Squad Lead" },
      { name: "Frontend Development", role: "Frontend Developer" },
    ]);
    expect(parsed.tags).toEqual(["catalog", "launch"]);
    expect(emitTeamMarkdown(parsed)).toBe(md); // fixed point
  });

  it("PROJECT.md round-trips", () => {
    const md = emitProjectMarkdown({
      name: "Website Revamp",
      slug: "website-revamp",
      description: "New marketing site",
      status: "active",
      goals: ["Launch", "Measure"],
    });
    expect(md).toContain("kind: project");
    const parsed = parseProjectMarkdown(md)!;
    expect(parsed).toMatchObject({
      name: "Website Revamp",
      status: "active",
      goals: ["Launch", "Measure"],
    });
    expect(emitProjectMarkdown(parsed)).toBe(md);
  });

  it("TASK.md round-trips", () => {
    const md = emitTaskMarkdown({
      title: "Write launch email",
      slug: "write-launch-email",
      status: "todo",
      assignee: "email-marketer",
      description: "Draft the sequence",
    });
    expect(md).toContain("kind: task");
    const parsed = parseTaskMarkdown(md)!;
    expect(parsed).toMatchObject({
      title: "Write launch email",
      status: "todo",
      assignee: "email-marketer",
      description: "Draft the sequence",
    });
    expect(emitTaskMarkdown(parsed)).toBe(md);
  });

  it("SKILL.md round-trips preserving the body verbatim", () => {
    const body = "# Deploy Runbook\n\nStep 1. Do the thing.\n\n## Notes\n\n- careful\n";
    const md = emitSkillMarkdown({
      name: "Deploy Runbook",
      slug: "deploy-runbook",
      description: "How to deploy",
      category: "operations",
      tags: ["ops"],
      body,
    });
    expect(md).toContain("kind: skill");
    const parsed = parseSkillPackageMarkdown(md)!;
    expect(parsed.body).toBe(body);
    expect(emitSkillMarkdown(parsed)).toBe(md);
  });

  it("COMPANY.md + AGENTS.md still parse alongside the new kinds in one package", () => {
    const files = [
      {
        path: "COMPANY.md",
        content: emitCompanyMarkdown({ name: "Acme", slug: "acme", goals: ["g"] }),
      },
      {
        path: "agents/ada/AGENTS.md",
        content: emitAgentMarkdown({ name: "Ada", slug: "ada", role: "ceo" }),
      },
      {
        path: "teams/acme/TEAM.md",
        content: emitTeamMarkdown({
          name: "Acme Team",
          slug: "acme-team",
          members: [{ name: "Ada", role: "ceo" }],
        }),
      },
      {
        path: "projects/p1/PROJECT.md",
        content: emitProjectMarkdown({ name: "P1", slug: "p1", goals: ["x"] }),
      },
      { path: "tasks/t1/TASK.md", content: emitTaskMarkdown({ title: "T1", slug: "t1" }) },
      {
        path: "skills/s1/SKILL.md",
        content: emitSkillMarkdown({ name: "S1", slug: "s1", body: "# S1\n" }),
      },
    ];
    const plan = parseCompanyPackageFiles(files);
    expect(plan.company?.name).toBe("Acme");
    expect(plan.agents).toHaveLength(1);
    expect(plan.teams).toHaveLength(1);
    expect(plan.teams[0].members).toEqual([{ name: "Ada", role: "ceo" }]);
    expect(plan.projects).toHaveLength(1);
    expect(plan.tasks).toHaveLength(1);
    expect(plan.skills).toHaveLength(1);
    expect(plan.warnings).toEqual([]);
  });
});

describe("sha256 + pinned source refs + integrity", () => {
  it("sha256Hex matches known vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("hashPackageFiles is deterministic + order-independent", () => {
    const a = [
      { path: "COMPANY.md", content: "one" },
      { path: "TEAM.md", content: "two" },
    ];
    const b = [
      { path: "TEAM.md", content: "two" },
      { path: "COMPANY.md", content: "one" },
    ];
    expect(hashPackageFiles(a)).toBe(hashPackageFiles(b));
    expect(hashPackageFiles(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("parseSourceRef parses a GitHub-pinned ref with sha256", () => {
    const digest = "a".repeat(64);
    const ref = parseSourceRef(`github:MissionControlSquad/teams@bundled#sha256:${digest}`)!;
    expect(ref).toEqual({
      host: "github",
      repo: "MissionControlSquad/teams",
      ref: "bundled",
      commit: null,
      sha256: digest,
    });
    // a 40-hex ref is recognized as a commit
    const commit = "0123456789abcdef0123456789abcdef01234567";
    expect(parseSourceRef(`github:o/r@${commit}`)!.commit).toBe(commit);
    // round-trips through format
    expect(formatSourceRef(ref)).toBe(`github:MissionControlSquad/teams@bundled#sha256:${digest}`);
  });

  it("rejects a malformed sha256 and non-github refs", () => {
    expect(parseSourceRef("github:o/r@main#sha256:not-hex")).toBeNull();
    expect(parseSourceRef("https://example.com/pkg")).toBeNull();
    expect(parseSourceRef(null)).toBeNull();
  });

  it("verifyPackageIntegrity accepts a matching package and rejects a tampered one", () => {
    const files = [
      { path: "COMPANY.md", content: "hello" },
      { path: "teams/x/TEAM.md", content: "roles" },
    ];
    const digest = hashPackageFiles(files);
    const good = `github:o/r@bundled#sha256:${digest}`;
    expect(verifyPackageIntegrity(files, good).ok).toBe(true);

    // tamper one byte → digest changes → rejected
    const tampered = files.map((f) => (f.path === "COMPANY.md" ? { ...f, content: "hell0" } : f));
    const res = verifyPackageIntegrity(tampered, good);
    expect(res.ok).toBe(false);
    expect(res.expected).toBe(digest);
    expect(res.actual).not.toBe(digest);

    // no sha256 in the ref → nothing to verify → ok
    expect(verifyPackageIntegrity(files, "github:o/r@bundled").ok).toBe(true);
  });
});
