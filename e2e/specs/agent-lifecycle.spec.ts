import { test, expect, type APIRequestContext } from "@playwright/test";

// P0: the agent lifecycle. A human creates + assigns work through the real UI; the agent's own
// runtime steps (which no human performs) go through the Bearer-key REST API exactly as the runtime
// would on any environment. Web-first assertions only - no arbitrary waits.
const SUF = Date.now().toString().slice(-6);
const AGENT_NAME = `E2E Nova ${SUF}`;
const TASK_TITLE = `Fix nav dropdown overflow ${SUF}`;

// A call the agent's runtime makes, authenticated by its API key.
function bearer(req: APIRequestContext, key: string) {
  return {
    get: (path: string) => req.get(path, { headers: { Authorization: `Bearer ${key}` } }),
    post: (path: string, data: unknown) =>
      req.post(path, { headers: { Authorization: `Bearer ${key}` }, data }),
    patch: (path: string, data: unknown) =>
      req.patch(path, { headers: { Authorization: `Bearer ${key}` }, data }),
  };
}
const gql = (req: APIRequestContext, query: string, variables?: Record<string, unknown>) =>
  req.post("/api/graphql", { data: { query, variables } }).then((r) => r.json());

test("agent lifecycle: create in UI, load skill+config from cloud, work, deliver, rework, approve, done", async ({
  page,
  request,
}) => {
  // ---- 1. HUMAN creates the agent through the real wizard UI ------------------------------------
  await page.goto("/agents/new");
  await expect(page.getByRole("button", { name: /use this template/i })).toBeVisible();
  // Pick a fresh (not already-created) template so the CTA enables.
  await page.getByText("Frontend Development", { exact: true }).first().click();
  await page.getByRole("button", { name: /use this template/i }).click();
  await page.getByPlaceholder(/Nova, Rex/i).fill(AGENT_NAME);
  await page.getByPlaceholder(/Research Specialist/i).fill("Frontend Developer");
  await page.getByRole("button", { name: /create agent/i }).click();
  // The wizard advances to the setup step once the agent exists.
  await expect(page.getByText(/setup|IDENTITY|Download/i).first()).toBeVisible();

  // ---- 2. resolve the created agent, give it the claude runtime + an API key (as the setup UI does)
  const list = await gql(request, "query{ agents{ id name } }");
  const agentId: string = list.data.agents.find((a: { name: string }) => a.name === AGENT_NAME)?.id;
  expect(agentId, "created agent should be queryable").toBeTruthy();
  await gql(request, `mutation($a:String!){ setAgentRuntime(agentId:$a, adapter:"claude", model:"claude-haiku-4-5-20251001"){ id } }`, { a: agentId });
  const keyRes = await request.post(`/api/agents/${agentId}/regenerate-key`).then((r) => r.json());
  const key: string = keyRes.apiKey;
  expect(key).toMatch(/^mc_/);
  const rt = bearer(request, key);

  // ---- 3. the agent's RUNTIME activates + comes online (not a human action) ---------------------
  await rt.post("/api/events/ingest", { type: "agent.sync_identity", payload: { name: AGENT_NAME } });
  await rt.get("/api/agents/me/heartbeat-preflight");

  // ---- 4. a task is created + assigned to the agent (seed via API, assert via UI) ---------------
  const taskRes = await gql(request, `mutation($a:String!){ createTask(title:"${TASK_TITLE}", description:"Dropdown clips on mobile - fix the CSS overflow.", assigneeIds:[$a]){ id } }`, { a: agentId });
  const taskId: string = taskRes.data.createTask.id;
  expect(taskId).toBeTruthy();

  // ---- 5. the agent loads EVERYTHING from the cloud (skill + full config set) -------------------
  const ctx = await rt.get(`/api/agents/me/context?taskId=${taskId}`).then((r) => r.json());
  expect(ctx.skills[0].key, "role skill served from cloud").toBe("role:frontend-dev");
  const files = ctx.configFiles.map((f: { filename: string }) => f.filename);
  expect(files).toEqual(expect.arrayContaining(["IDENTITY.md", "SOUL.md", "SKILL.md", "PLAYBOOK.md", "AGENTS.md"]));

  // ---- 6. the agent works + submits a deliverable ----------------------------------------------
  await rt.post("/api/tasks/checkout", { taskId, action: "checkout" });
  await rt.patch(`/api/tasks/${taskId}`, { status: "in_progress" });
  await rt.post(`/api/tasks/${taskId}/deliverables`, {
    title: "PR: fix nav dropdown overflow",
    kind: "code",
    language: "css",
    content: "- .nav-dropdown{overflow:hidden}\n+ .nav-dropdown{overflow-y:auto;max-height:80vh}",
  });
  await rt.patch(`/api/tasks/${taskId}`, { status: "review" });

  // Assert in the UI that the work shows up.
  await page.goto(`/task/${taskId}`);
  await expect(page.getByText("PR: fix nav dropdown overflow").first()).toBeVisible();
  await expect(page.getByText(AGENT_NAME).first()).toBeVisible();

  // ---- 7. the parent (squad lead) requests REWORK, then the agent resubmits, then APPROVES ------
  const leads = await gql(request, "query{ agents{ id role } }");
  const leadId: string = leads.data.agents.find((a: { role: string }) => /lead/i.test(a.role || ""))?.id;
  expect(leadId, "a squad-lead agent should exist to review").toBeTruthy();
  const leadKey: string = (await request.post(`/api/agents/${leadId}/regenerate-key`).then((r) => r.json())).apiKey;
  const lead = bearer(request, leadKey);

  await lead.post(`/api/tasks/${taskId}/reject`, {
    rejectionReason: "Add a max-height guard for very small screens.",
    changesNeeded: ["Cap max-height at 60vh on <360px"],
  });
  await page.reload();
  await expect(page.getByText(/rejected|changes/i).first()).toBeVisible();

  await rt.patch(`/api/tasks/${taskId}`, { status: "in_progress" });
  await rt.post(`/api/tasks/${taskId}/deliverables`, {
    title: "PR v2: nav dropdown small-screen guard",
    kind: "code",
    language: "css",
    content: "+ @media(max-width:360px){ .nav-dropdown{max-height:60vh} }",
  });
  await rt.patch(`/api/tasks/${taskId}`, { status: "review" });
  const appr = await lead.post(`/api/tasks/${taskId}/approve`, { taskId, approvalComment: "LGTM v2 - ship it." });
  expect(appr.ok()).toBeTruthy();

  // ---- 8. the task is DONE - the lead's approval shows in the UI + status is done --------------
  await page.reload();
  await expect(page.getByText(/LGTM v2/i)).toBeVisible();
  const finalTask = await rt.get(`/api/tasks/${taskId}`).then((r) => r.json());
  expect(finalTask.status).toBe("done");

  // ---- 9. the agent goes offline ---------------------------------------------------------------
  await rt.post("/api/events/ingest", { type: "agent.went_to_sleep", payload: {} });
});
