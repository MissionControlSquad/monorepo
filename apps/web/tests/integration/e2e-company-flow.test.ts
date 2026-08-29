import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import { invalidateFlagCache, setTestFeature } from "../../src/server/feature-flags";
import { FLAG_KEYS } from "@agentcenter/utils";
import { createTestAgent } from "../helpers";

// End-to-end "does the whole product flow work" check, driven through the REAL /api/graphql route:
//   create company → create project → create agent → assign agent to company → add agent to project
//   → create a task for the agent → set workspace governance → set the agent's runtime to the Claude CLI.
// Every step goes UI-op → route → resolver → service → Postgres, exactly as the dashboard does.
const SECRET = "e2e-company-secret";
const WS = "ws_e2e_company";
let humanId = "";

async function gql(
  query: string,
  variables?: Record<string, unknown>,
  role: "admin" | "member" = "admin",
) {
  const token = await createJWT(
    { userId: humanId, workspaceId: WS, userRole: role, email: "u@x.com" },
    SECRET,
  );
  const req = new Request("http://test/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `bb-workspace-token=${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return JSON.parse(await (await POST(req)).text()) as { data?: any; errors?: any };
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
  humanId = "human-e2e-company";
});

beforeEach(async () => {
  // clean slate for this workspace (Task is scoped via its project, not a direct workspaceId)
  const wsProjects = await prisma.project.findMany({
    where: { workspaceId: WS },
    select: { id: true },
  });
  await prisma.task.deleteMany({ where: { projectId: { in: wsProjects.map((p) => p.id) } } });
  await prisma.agent.deleteMany({ where: { workspaceId: WS } });
  await prisma.project.deleteMany({ where: { workspaceId: WS } });
  await prisma.agentCompany.deleteMany({ where: { workspaceId: WS } });
  // enable every feature flag so no vertical is gated off
  for (const key of Object.values(FLAG_KEYS)) {
    setTestFeature(key, true);
  }
  invalidateFlagCache();
});

describe("E2E: company → projects → agents → tasks → governance → claude runtime", () => {
  it("runs the full chained flow through the real API, wiring the agent to the Claude CLI", async () => {
    // 1) create a company
    const co = await gql(
      `mutation{ createAgentCompany(name:"Acme Robotics", description:"demo co"){ id slug name } }`,
    );
    expect(co.errors, JSON.stringify(co.errors)).toBeUndefined();
    const companyId: string = co.data.createAgentCompany.id;
    expect(companyId).toBeTruthy();

    // 2) create a project
    const pr = await gql(`mutation{ createProject(name:"Warehouse Automation"){ id name } }`);
    expect(pr.errors, JSON.stringify(pr.errors)).toBeUndefined();
    const projectId: string = pr.data.createProject.id;
    expect(projectId).toBeTruthy();

    // 3) create an agent (canonical test helper), scoped to this workspace
    const { agent } = await createTestAgent({
      name: "Rosie",
      role: "Automation Engineer",
      status: "active",
    });
    await prisma.agent.update({ where: { id: agent.id }, data: { workspaceId: WS } });
    const agentId = agent.id;

    // 4) assign the agent to the company
    const assignCo = await gql(
      `mutation($a:String!,$c:String!){ setAgentCompany(agentId:$a, companyId:$c){ id companyId } }`,
      { a: agentId, c: companyId },
    );
    expect(assignCo.errors, JSON.stringify(assignCo.errors)).toBeUndefined();
    expect(assignCo.data.setAgentCompany.companyId).toBe(companyId);

    // 5) add the agent to the project
    const addMember = await gql(
      `mutation($p:String!,$a:String!){ addProjectMember(projectId:$p, agentId:$a){ id } }`,
      { p: projectId, a: agentId },
    );
    expect(addMember.errors, JSON.stringify(addMember.errors)).toBeUndefined();
    expect(addMember.data.addProjectMember.id).toBeTruthy();

    // 6) create a task for the agent, in the project
    const task = await gql(
      `mutation($a:String!,$p:String!){ createTask(title:"Calibrate arm", description:"first job", assigneeIds:[$a], projectId:$p){ id title status } }`,
      { a: agentId, p: projectId },
    );
    expect(task.errors, JSON.stringify(task.errors)).toBeUndefined();
    const taskId: string = task.data.createTask.id;
    expect(taskId).toBeTruthy();

    // 7) set workspace governance (agents require approval)
    const gov = await gql(
      `mutation{ setAgentGovernance(requireAgentApproval:true){ requireAgentApproval } }`,
    );
    expect(gov.errors, JSON.stringify(gov.errors)).toBeUndefined();
    expect(gov.data.setAgentGovernance.requireAgentApproval).toBe(true);

    // 8) wire the agent's runtime to the Claude CLI (the "claude" built-in adapter)
    const rt = await gql(
      `mutation($a:String!){ setAgentRuntime(agentId:$a, adapter:"claude", model:"claude-haiku-4-5-20251001"){ id } }`,
      { a: agentId },
    );
    expect(rt.errors, JSON.stringify(rt.errors)).toBeUndefined();

    // ---- verify everything actually persisted, cross-module ----
    const persistedAgent = await prisma.agent.findUnique({ where: { id: agentId } });
    expect(persistedAgent?.companyId).toBe(companyId); // agent ↔ company
    expect(persistedAgent?.runtimeAdapter).toBe("claude"); // agent ↔ claude runtime

    const persistedTask = await prisma.task.findUnique({
      where: { id: taskId },
      include: { assignees: true },
    });
    expect(persistedTask?.projectId).toBe(projectId); // task ↔ project
    expect(persistedTask?.assignees.length ?? 0).toBeGreaterThan(0); // task ↔ agent (assignee)
  });
});
