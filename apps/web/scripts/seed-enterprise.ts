/**
 * Enterprise seed — creates data only (no DB cleanup).
 * Uses the same API route handlers as e2e tests. Run against your local DB to test the UI.
 *
 * Config (env): SEED_FAST=1 for small run, or SEED_NUM_AGENTS, SEED_NUM_TASKS, etc.
 *
 * Run: npm run seed:enterprise  (loads .env)
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { prisma } from "../src/server/prisma";
import { SetupStatus, DeliverableKind, Priority } from "../src/server/constants";
import { agentCache, agentListCache, memberCache, projectIdsCache } from "../src/server/cache";
import {
  adminSetup,
  adminLogin,
  buildRequest,
  callRoute,
  extractSessionCookie,
} from "../tests/helpers";

import { POST as createAgent } from "../app/api/agents/create/route";
import { POST as createProject } from "../app/api/projects/route";
import { POST as createTaskHandler } from "../app/api/tasks/route";
import { POST as createMessage } from "../app/api/tasks/[id]/messages/route";
import { POST as createDeliverable } from "../app/api/tasks/[id]/deliverables/route";

// This seed drives the in-process API route handlers in a tight loop (thousands of tasks/messages),
// which would otherwise trip the per-IP rate limiter (~120/60s) and abort with `Create task failed: 429`.
// checkRateLimit() reads this flag at call-time, so setting it here (before any handler runs) bypasses
// the limiter for this seed process only — the served app is a separate process and stays rate-limited.
process.env.SEED_BYPASS_RATE_LIMIT = "1";

const isFast = process.env.SEED_FAST === "1" || process.env.SEED_FAST === "true";

const CONFIG = {
  numAgents: isFast ? 20 : parseInt(process.env.SEED_NUM_AGENTS ?? "200", 10),
  numTasks: isFast ? 100 : parseInt(process.env.SEED_NUM_TASKS ?? "10000", 10),
  numRootTasks: isFast ? 40 : parseInt(process.env.SEED_NUM_ROOT ?? "2500", 10),
  numParentTasks: isFast ? 10 : parseInt(process.env.SEED_NUM_PARENTS ?? "500", 10),
  commentsPerTask: isFast ? 5 : parseInt(process.env.SEED_COMMENTS_PER_TASK ?? "20", 10),
  deliverablesPerTask: isFast ? 3 : parseInt(process.env.SEED_DELIVERABLES_PER_TASK ?? "12", 10),
  childrenPerParent: isFast ? 5 : parseInt(process.env.SEED_CHILDREN_PER_PARENT ?? "14", 10),
  assigneesMin: 1,
  assigneesMax: isFast ? 2 : 3,
};

const numChildTasks = CONFIG.numTasks - CONFIG.numRootTasks - CONFIG.numParentTasks;

type AgentCred = { agentId: string; apiKey: string };

const TITLES = [
  "Implement auth flow",
  "Refactor API layer",
  "Add unit tests",
  "Fix responsive layout",
  "Document API",
  "Optimize queries",
  "Setup CI pipeline",
  "Design system tokens",
  "E2E test checkout",
  "Migrate to React 19",
  "Accessibility audit",
  "Deploy to staging",
];
const DESCRIPTIONS = [
  "As a user I need to complete the flow so that we meet the acceptance criteria.",
  "Technical approach: we will iterate and test. Acceptance criteria: covered by specs.",
];
const COMMENT_BODIES = [
  "LGTM, just one nit on the naming.",
  "I'll take this one.",
  "Waiting on design.",
  "Done in branch feature/seed.",
  "Let's sync tomorrow on this.",
  "Moved to review.",
];
const DELIVERABLE_TITLES = ["Summary doc", "API spec", "Screenshots", "Test report", "README"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function int(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

async function run() {
  console.log("🌱 Enterprise seed (create data only, no DB cleanup)");
  console.log("   Config:", CONFIG);

  if (numChildTasks < 0) {
    throw new Error(
      `Invalid config: numRootTasks + numParentTasks + (numParentTasks * childrenPerParent) must be <= numTasks.`,
    );
  }

  // Ensure admin exists (idempotent)
  const setupRes = await adminSetup("admin", "securepass123", "10.0.0.1");
  if (setupRes.status === 400) {
    const d = await setupRes.json();
    if (!d.error?.includes("already exists")) throw new Error(`Setup failed: ${JSON.stringify(d)}`);
  } else if (setupRes.status !== 200) {
    throw new Error(`Setup failed: ${setupRes.status}`);
  }
  const loginRes = await adminLogin("admin", "securepass123", "10.0.0.2");
  if (loginRes.status !== 200) throw new Error("Admin login failed");
  // /api/agents/create is human-ADMIN gated (withTenancy). Thread the admin session cookie into every
  // create-agent call, exactly as the tests do — without it the create returns 401 UNAUTHENTICATED.
  const sessionCookie = extractSessionCookie(loginRes);
  if (!sessionCookie) throw new Error("Admin login returned no mc_session cookie");
  const adminHeaders = { cookie: `mc_session=${sessionCookie}` };
  console.log("✅ Admin ready");

  // e2e handoff: expose the freshly-minted mc_session to the Playwright auth setup. The seed mints via
  // the ungated createSessionToken (AUTH_SECRET-signed) so the cookie authenticates against the served
  // production app directly — no TEST_SESSION_SECRET / NODE_ENV=test needed on the server. auth.setup.ts
  // reads this file and injects the cookie into the browser context. Written only when asked (CI/e2e).
  if (process.env.E2E_WRITE_STORAGE_STATE) {
    const out = process.env.E2E_SEED_SESSION_PATH
      ? resolve(process.env.E2E_SEED_SESSION_PATH)
      : resolve(process.cwd(), "../../e2e/.auth/seed-session.json");
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(
      out,
      JSON.stringify({
        cookie: sessionCookie,
        baseUrl: process.env.BASE_URL ?? "http://localhost:3000",
      }),
    );
    console.log("✅ Wrote e2e seed session →", out);
  }

  // Feature entitlement (incl. the RUNNERS tier the agent-lifecycle e2e needs) now comes from
  // buildbase — the local feature_flags table was removed. Enable RUNNERS on the e2e workspace's
  // buildbase plan instead of seeding a DB row here.

  // Squad Lead
  let squadLeadCred: AgentCred;
  {
    const req = buildRequest("POST", "/api/agents/create", {
      headers: adminHeaders,
      body: { name: "Seed Lead", role: "Squad Lead", username: "seed-lead" },
    });
    const res = await callRoute(createAgent, req);
    if (res.status === 409) {
      throw new Error(
        'Agent username "seed-lead" already exists. Delete that agent or use a fresh DB if you need to re-seed from scratch.',
      );
    }
    if (res.status !== 201)
      throw new Error(`Create agent failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    squadLeadCred = { agentId: data.agent.id, apiKey: data.apiKey };
    await prisma.agent.update({
      where: { id: squadLeadCred.agentId },
      data: { setupStatus: SetupStatus.ACTIVE },
    });
    agentCache.clear();
  }
  console.log("✅ Squad Lead ready");

  // Other agents
  const agentCreds: AgentCred[] = [squadLeadCred];
  const roles = ["Engineer", "Designer", "QA", "PM", "DevOps", "Research", "Writer", "Lead"];
  for (let i = 1; i < CONFIG.numAgents; i++) {
    const req = buildRequest("POST", "/api/agents/create", {
      headers: adminHeaders,
      body: {
        name: `Agent ${i + 1}`,
        role: roles[i % roles.length],
        username: `agent-${i}-${Date.now()}-${i}`,
      },
    });
    const res = await callRoute(createAgent, req);
    if (res.status !== 201) throw new Error(`Create agent ${i} failed: ${res.status}`);
    const data = await res.json();
    agentCreds.push({ agentId: data.agent.id, apiKey: data.apiKey });
    await prisma.agent.update({
      where: { id: data.agent.id },
      data: { setupStatus: SetupStatus.ACTIVE },
    });
  }
  agentCache.clear();
  console.log("✅ Agents:", agentCreds.length);

  // Project
  const projectReq = buildRequest("POST", "/api/projects", {
    apiKey: squadLeadCred.apiKey,
    body: {
      name: "Enterprise Kanban Test",
      description: "Seed project — tasks, comments, deliverables",
      memberIds: agentCreds.map((c) => c.agentId),
    },
  });
  const projectRes = await callRoute(createProject, projectReq);
  if (projectRes.status !== 201) throw new Error(`Create project failed: ${projectRes.status}`);
  const projectData = await projectRes.json();
  const projectId = projectData.id;
  memberCache.clear();
  projectIdsCache.clear();
  agentListCache.set("all", []);
  console.log("✅ Project:", projectId);

  // Root + parent tasks
  const parentTaskIds: string[] = [];
  const totalRootAndParent = CONFIG.numRootTasks + CONFIG.numParentTasks;
  for (let i = 0; i < totalRootAndParent; i++) {
    const cred = pick(agentCreds);
    const assigneeCount = int(CONFIG.assigneesMin, CONFIG.assigneesMax);
    const assigneeIds = [...agentCreds]
      .sort(() => Math.random() - 0.5)
      .slice(0, assigneeCount)
      .map((c) => c.agentId);
    const req = buildRequest("POST", "/api/tasks", {
      apiKey: cred.apiKey,
      body: {
        title: `${pick(TITLES)} ${int(1, 999)}`,
        description: pick(DESCRIPTIONS),
        projectId,
        assigneeIds,
        priority: pick([Priority.LOW, Priority.MEDIUM, Priority.HIGH]),
      },
    });
    const res = await callRoute(createTaskHandler, req);
    if (res.status !== 201) throw new Error(`Create task failed: ${res.status}`);
    const data = await res.json();
    if (i >= CONFIG.numRootTasks) parentTaskIds.push(data.id);
  }
  console.log("✅ Root + parent tasks:", totalRootAndParent);

  // Child tasks
  const targetChildren = Math.min(numChildTasks, CONFIG.numParentTasks * CONFIG.childrenPerParent);
  for (let i = 0; i < targetChildren; i++) {
    const parentId = parentTaskIds[i % parentTaskIds.length];
    const cred = pick(agentCreds);
    const req = buildRequest("POST", "/api/tasks", {
      apiKey: cred.apiKey,
      body: {
        title: `Subtask: ${pick(TITLES)} ${int(1, 999)}`,
        description: pick(DESCRIPTIONS),
        projectId,
        parentTaskId: parentId,
        assigneeIds: [pick(agentCreds).agentId],
      },
    });
    const res = await callRoute(createTaskHandler, req);
    if (res.status !== 201) throw new Error(`Create child task failed: ${res.status}`);
    if ((i + 1) % 500 === 0) console.log("   Child tasks:", i + 1);
  }
  console.log("✅ Child tasks:", targetChildren);

  // Messages and deliverables for all project tasks
  const tasks = await prisma.task.findMany({
    where: { projectId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  let msgCount = 0;
  let delCount = 0;
  for (let ti = 0; ti < tasks.length; ti++) {
    const taskId = tasks[ti].id;
    for (let c = 0; c < CONFIG.commentsPerTask; c++) {
      const req = buildRequest("POST", `/api/tasks/${taskId}/messages`, {
        apiKey: pick(agentCreds).apiKey,
        body: { content: pick(COMMENT_BODIES) },
      });
      const res = await callRoute(createMessage, req, { id: taskId });
      if (res.status !== 201) throw new Error(`Create message failed: ${res.status}`);
      msgCount++;
    }
    for (let d = 0; d < CONFIG.deliverablesPerTask; d++) {
      const req = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
        apiKey: pick(agentCreds).apiKey,
        body: {
          title: `${pick(DELIVERABLE_TITLES)} ${int(1, 999)}`,
          kind: pick(Object.values(DeliverableKind)),
          content: "Seed content via API",
        },
      });
      const res = await callRoute(createDeliverable, req, { id: taskId });
      if (res.status !== 201) throw new Error(`Create deliverable failed: ${res.status}`);
      delCount++;
    }
    if ((ti + 1) % 200 === 0) {
      console.log(
        `   Tasks ${ti + 1}/${tasks.length} → messages ${msgCount}, deliverables ${delCount}`,
      );
    }
  }

  const [taskCount, finalMsg, finalDel] = await Promise.all([
    prisma.task.count({ where: { projectId } }),
    prisma.message.count({ where: { task: { projectId } } }),
    prisma.deliverable.count({ where: { task: { projectId } } }),
  ]);
  console.log("\n🎉 Seed done (data only, DB not truncated).");
  console.log("   Project ID:", projectId);
  console.log("   Tasks:", taskCount, "| Messages:", finalMsg, "| Deliverables:", finalDel);
}

run()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Force-exit after seeding. In CI (REDIS_URL set) the module-level, Redis-backed API rate limiters
    // imported via the route handlers hold an open Redis connection that keeps the event loop alive, so
    // the process would otherwise hang until the job timeout even though `run()` already finished.
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
