import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { hashApiKey } from "../../src/server/api-key";
import { agentCache } from "../../src/server/cache";
import { invalidateFlagCache } from "../../src/server/feature-flags";
import { getOrCreateAgentProfileId } from "../../src/server/agent-profile";
import { GET as GET_CONTEXT } from "../../app/api/agents/me/context/route";

// Tier D (Slice 3): stateless per-task context bundle. Agent-key auth; the bundle is composed from
// identity + skills + instructions + the task/project/linked docs; task access is scoped to the
// agent's projects (or unscoped tasks). License bypassed under VITEST.
const WS = "ws_ctx";
const KEY = "mc_ctx_key";
let agentId = "";
let profileId = "";

async function makeAgent(key: string): Promise<string> {
  const agent = await prisma.agent.create({
    data: {
      name: "Ctx Agent",
      role: "worker",
      personality: "diligent",
      workspaceId: WS,
      setupStatus: "active",
      apiKeyHash: hashApiKey(key),
    },
  });
  return agent.id;
}

function getContext(taskId: string | null, key = KEY) {
  const url = `http://test/api/agents/me/context${taskId ? `?taskId=${taskId}` : ""}`;
  return GET_CONTEXT(new Request(url, { headers: { Authorization: `Bearer ${key}` } }), {
    params: Promise.resolve({}),
  });
}

async function enableRunners() {
  await prisma.featureFlag.upsert({
    where: { key: "runners" },
    create: { key: "runners", enabled: true, managedBy: "user" },
    update: { enabled: true },
  });
  invalidateFlagCache();
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = "ctx-secret";
});
beforeEach(async () => {
  agentCache.clear();
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE deliverables, documents, tasks, project_members, projects, agent_skills, skills, agent_instructions, agents, profiles CASCADE`,
  );
  await prisma.featureFlag.deleteMany({ where: { key: "runners" } });
  invalidateFlagCache();
  await enableRunners();
  agentId = await makeAgent(KEY);
  profileId = await getOrCreateAgentProfileId(agentId);
});

async function makeProjectTask(): Promise<{ projectId: string; taskId: string }> {
  const project = await prisma.project.create({
    data: {
      name: "Website",
      description: "the site",
      workspaceId: WS,
      status: "active",
      sourceType: "remote_repo",
      repoUrl: "https://github.com/acme/site.git",
      repoRef: "main",
    },
  });
  await prisma.projectMember.create({
    data: { projectId: project.id, profileId, status: "active" },
  });
  const task = await prisma.task.create({
    data: {
      title: "Fix nav",
      description: "the navbar is broken",
      status: "assigned",
      priority: "high",
      tags: ["ui"],
      projectId: project.id,
    },
  });
  return { projectId: project.id, taskId: task.id };
}

describe("agent context endpoint (Tier D Slice 3)", () => {
  it("assembles identity + instructions + skills + task + project + linked artifacts", async () => {
    const { taskId } = await makeProjectTask();

    await prisma.agentInstruction.create({
      data: { agentId, fileName: "AGENTS.md", content: "Be careful." },
    });
    const skill = await prisma.skill.create({
      data: {
        workspaceId: WS,
        key: "lint",
        slug: "lint",
        name: "Linting",
        description: "run the linter",
        markdown: "# Lint\nrun eslint",
      },
    });
    await prisma.agentSkill.create({ data: { workspaceId: WS, agentId, skillId: skill.id } });
    await prisma.deliverable.create({
      data: { taskId, profileId, title: "PR", kind: "link", content: "diff" },
    });
    await prisma.document.create({
      data: { title: "Spec", content: "the spec", type: "note", taskId },
    });
    await prisma.task.create({
      data: { title: "subtask", description: "child", status: "inbox", parentTaskId: taskId },
    });

    const res = await getContext(taskId);
    const body = await res.json();
    expect(res.status).toBe(200);

    expect(body.version).toBe(1);
    expect(body.agent).toMatchObject({ id: agentId, name: "Ctx Agent", personality: "diligent" });
    expect(body.instructions).toEqual([{ fileName: "AGENTS.md", content: "Be careful." }]);
    // skills[0] is the cloud role skill (prepended); assigned library skills follow.
    expect(body.skills[0].key).toMatch(/^role:/);
    expect(body.skills.some((s: { key: string }) => s.key === "lint")).toBe(true);
    // the full config/identity file set is delivered from the cloud (no local files needed)
    expect(Array.isArray(body.configFiles)).toBe(true);
    expect(body.configFiles.map((f: { filename: string }) => f.filename)).toContain("SOUL.md");
    expect(body.configFiles.map((f: { filename: string }) => f.filename)).toContain("PLAYBOOK.md");
    expect(body.configVersion).toBeTruthy();
    expect(body.task).toMatchObject({ title: "Fix nav", status: "assigned", tags: ["ui"] });
    expect(body.project).toMatchObject({
      repoUrl: "https://github.com/acme/site.git",
      repoRef: "main",
    });
    expect(body.deliverables[0]).toMatchObject({ title: "PR", kind: "link" });
    expect(body.documents[0]).toMatchObject({ title: "Spec" });
    expect(body.subtasks[0]).toMatchObject({ title: "subtask" });
  });

  it("returns empty arrays when the agent/task have nothing linked", async () => {
    const { taskId } = await makeProjectTask();
    const res = await getContext(taskId);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.instructions).toEqual([]);
    // skills is never empty now — the cloud role skill is always present
    expect(body.skills.length).toBeGreaterThan(0);
    expect(body.skills[0].key).toMatch(/^role:/);
    expect(body.deliverables).toEqual([]);
    expect(body.documents).toEqual([]);
    expect(body.subtasks).toEqual([]);
    expect(body.task.title).toBe("Fix nav");
  });

  it("includes the agent's per-agent runtime when set; null otherwise", async () => {
    const { taskId } = await makeProjectTask();
    // default: no runtime configured
    expect((await (await getContext(taskId)).json()).runtime).toBeNull();
    // set a runtime on the agent
    await prisma.agent.update({
      where: { id: agentId },
      data: { runtimeAdapter: "claude", runtimeModel: "claude-opus-4-8", runtimeTemplate: null },
    });
    agentCache.clear();
    const body = await (await getContext(taskId)).json();
    expect(body.runtime).toMatchObject({
      adapter: "claude",
      model: "claude-opus-4-8",
      template: null,
    });
  });

  it("requires taskId", async () => {
    const res = await getContext(null);
    expect(res.status).toBe(400);
  });

  it("denies context for a task the agent cannot access", async () => {
    // A task in a project the agent is NOT a member of.
    const other = await prisma.project.create({
      data: { name: "Secret", workspaceId: WS, status: "active" },
    });
    const task = await prisma.task.create({
      data: { title: "hush", description: "secret", status: "inbox", projectId: other.id },
    });
    const res = await getContext(task.id);
    expect(res.status).toBe(404);
  });

  it("allows an unscoped task (no project)", async () => {
    const task = await prisma.task.create({
      data: { title: "loose", description: "no project", status: "inbox" },
    });
    const res = await getContext(task.id);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.project).toBeNull();
    expect(body.task.title).toBe("loose");
  });

  it("is feature-gated", async () => {
    const { taskId } = await makeProjectTask();
    await prisma.featureFlag.upsert({
      where: { key: "runners" },
      create: { key: "runners", enabled: false, managedBy: "user" },
      update: { enabled: false },
    });
    invalidateFlagCache();
    const res = await getContext(taskId);
    expect(res.status).toBe(403);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await GET_CONTEXT(new Request("http://test/api/agents/me/context?taskId=x"), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(401);
  });
});
