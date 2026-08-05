import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { invalidateFlagCache } from "../../src/server/feature-flags";
import { getOrCreateAgentProfileId } from "../../src/server/agent-profile";
import { FLAG_KEYS } from "@agentcenter/utils";
import { createTestAgent } from "../helpers";
// Agent-facing REST routes (Bearer key auth in-handler) — the exact calls an agent runtime makes,
// on ANY environment / CLI tech / server. No local files are read anywhere in this flow.
import { GET as GET_CONTEXT } from "../../app/api/agents/me/context/route";
import { POST as CHECKOUT } from "../../app/api/tasks/checkout/route";
import { POST as SUBMIT_DELIVERABLE } from "../../app/api/tasks/[id]/deliverables/route";
import { PATCH as PATCH_TASK } from "../../app/api/tasks/[id]/route";
import { POST as APPROVE } from "../../app/api/tasks/[id]/approve/route";

const BASE = "http://test";
const TASK_TITLE = "Fix the nav dropdown [e2e-fresh-agent-cloud]";
const req = (url: string, key: string, method = "GET", body?: unknown) =>
  new Request(url, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

// The complete OpenClaw-style file set every agent must receive from the cloud.
const EXPECTED_FILES = [
  "IDENTITY.md",
  "SOUL.md",
  "AGENTS.md",
  "HEARTBEAT.md",
  "PLAYBOOK.md",
  "TOOLS.md",
  "USER.md",
  "SKILL.md",
];

describe("E2E: a freshly-created agent works a task end-to-end from the CLOUD (any environment)", () => {
  let workerKey = "";
  let workerId = "";
  let leadKey = "";

  beforeAll(async () => {
    process.env.SYSTEM_SECRET = "e2e-fresh-agent";
  });

  beforeEach(async () => {
    // Scoped cleanup ONLY for this test's data — never touch other tests sharing the test DB.
    await prisma.deliverable.deleteMany({ where: { task: { title: TASK_TITLE } } }).catch(() => {});
    await prisma.task.deleteMany({ where: { title: TASK_TITLE } }).catch(() => {});
    await prisma.agent.deleteMany({ where: { name: { in: ["Nova FE", "Ada Lead"] } } });
    for (const key of Object.values(FLAG_KEYS)) {
      await prisma.featureFlag.upsert({
        where: { key },
        create: { key, enabled: true, managedBy: "user" },
        update: { enabled: true },
      });
    }
    invalidateFlagCache();

    // 1) Create a brand-new worker agent + a squad lead — with role runtime + role template set.
    const worker = await createTestAgent({ name: "Nova FE", role: "Frontend Developer", status: "active" });
    await prisma.agent.update({
      where: { id: worker.agent.id },
      data: { runtimeAdapter: "claude", runtimeModel: "claude-haiku-4-5-20251001", templateId: "frontend-dev" },
    });
    workerKey = worker.apiKey;
    workerId = worker.agent.id;

    const lead = await createTestAgent({ name: "Ada Lead", role: "Squad Lead", status: "active" });
    await prisma.agent.update({
      where: { id: lead.agent.id },
      data: { runtimeAdapter: "claude", templateId: "squad-lead" },
    });
    leadKey = lead.apiKey;
  });

  it("gets all identity/skill/config files + task from the cloud, then does the task to done", async () => {
    // 2) Assign the worker a task (unscoped so it is accessible without project membership).
    const profileId = await getOrCreateAgentProfileId(workerId);
    const task = await prisma.task.create({
      data: {
        title: TASK_TITLE,
        description: "The nav dropdown clips on mobile. Fix the overflow.",
        status: "assigned",
        assignees: { create: { profileId } },
      },
    });

    // 3) The fresh agent fetches EVERYTHING it needs from ONE cloud call — no local files.
    const ctxRes = await GET_CONTEXT(req(`${BASE}/api/agents/me/context?taskId=${task.id}`, workerKey));
    expect(ctxRes.status).toBe(200);
    const ctx = await ctxRes.json();

    // identity
    expect(ctx.agent).toMatchObject({ id: workerId, name: "Nova FE", role: "Frontend Developer" });
    // its cloud role skill (specific template)
    expect(ctx.skills[0].key).toBe("role:frontend-dev");
    // the FULL config/identity file set, generated from the control plane
    const fileNames: string[] = (ctx.configFiles ?? []).map((f: { filename: string }) => f.filename);
    for (const f of EXPECTED_FILES) expect(fileNames).toContain(f);
    expect(ctx.configVersion).toBeTruthy();
    // the task itself is attached
    expect(ctx.task).toMatchObject({ id: task.id, title: TASK_TITLE, status: "assigned" });

    // 4) The agent works the task purely via the cloud API.
    const co = await CHECKOUT(req(`${BASE}/api/tasks/checkout`, workerKey, "POST", { taskId: task.id, action: "checkout" }));
    expect(co.status).toBe(200);

    const del = await SUBMIT_DELIVERABLE(
      req(`${BASE}/api/tasks/${task.id}/deliverables`, workerKey, "POST", {
        title: "PR: fix nav dropdown overflow",
        kind: "code",
        content: "- .nav-dropdown{overflow:hidden}\n+ .nav-dropdown{overflow:visible;max-height:80vh;overflow-y:auto}",
        language: "css",
      }),
      params(task.id),
    );
    expect(del.status).toBeLessThan(300); // 201 Created

    const review = await PATCH_TASK(
      req(`${BASE}/api/tasks/${task.id}`, workerKey, "PATCH", { status: "review" }),
      params(task.id),
    );
    expect(review.status).toBe(200);

    // 5) The squad lead approves — also purely via the cloud API.
    const appr = await APPROVE(
      req(`${BASE}/api/tasks/${task.id}/approve`, leadKey, "POST", {
        taskId: task.id,
        approvalComment: "LGTM — scrolls cleanly on mobile.",
      }),
      params(task.id),
    );
    expect(appr.status).toBe(200);

    // 6) Verify the full chain landed: task done, deliverable attached.
    const finalTask = await prisma.task.findUnique({ where: { id: task.id } });
    expect(finalTask?.status).toBe("done");
    const deliverables = await prisma.deliverable.findMany({ where: { taskId: task.id } });
    expect(deliverables.length).toBeGreaterThan(0);
    expect(deliverables[0].title).toBe("PR: fix nav dropdown overflow");
  });
});
