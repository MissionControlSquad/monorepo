/**
 * End-to-end integration test for Mission Control.
 *
 * Follows the real user journey from first-time server setup through
 * the full task lifecycle. Each section builds on the previous one.
 *
 * Flow: Setup → Brute Force → Login → Create Agents → Tasks → Messages → Deliverables → Cleanup
 */
import { describe, it, expect } from "vitest";
import { prisma } from "../../src/server/prisma";
import { agentCache, memberCache, projectIdsCache, subscriberCache } from "../../src/server/cache";
import { deleteFile } from "../../src/server/storage/r2";
import {
  pubsub,
  PubSubEvent,
  notificationTopic,
  messageTopic,
  messageReactionTopic,
} from "../../src/server/pubsub";
import { getOrCreateAgentProfileId } from "../../src/server/agent-profile";
import {
  adminSetup,
  adminLogin,
  adminLogout,
  extractSessionCookie,
  buildRequest,
  callRoute,
  runGraphQL,
} from "../helpers";
import {
  SetupStatus,
  TaskStatus,
  QueueItemStatus,
  NotificationKind,
} from "../../src/server/constants";

// ─── Shared state across the sequential flow ───────────────────────
let sessionCookie: string;
let rexApiKey: string;
let rexAgentId: string;
let rexProfileId: string;
let novaApiKey: string;
let novaAgentId: string;
let novaProfileId: string;
let taskId: string;
let deliverableId: string;
let kiaApiKey: string;
let kiaAgentId: string;
let sageApiKey: string;
let sageAgentId: string;
let projectId: string;
let projectTaskId: string;
let reviewMessageId: string;
let lifecycleTaskId: string;
let lifecycleDeliverableId: string;
let accessControlTaskId: string;
let dashboardTaskId: string;
let kiaProfileId: string;
let sageProfileId: string;

// ─── Route handler imports ─────────────────────────────────────────
import { POST as createAgent } from "../../app/api/agents/create/route";
import { GET as getMe } from "../../app/api/agents/me/route";
import { GET as listAgents } from "../../app/api/agents/route";
import { GET as listTasks, POST as createTaskHandler } from "../../app/api/tasks/route";
import {
  GET as getTask,
  PATCH as updateTask,
  DELETE as deleteTask,
} from "../../app/api/tasks/[id]/route";
import {
  GET as listMessages,
  POST as createMessage,
} from "../../app/api/tasks/[id]/messages/route";
import {
  GET as listDeliverables,
  POST as createDeliverable,
} from "../../app/api/tasks/[id]/deliverables/route";
import { PATCH as updateDeliverable } from "../../app/api/tasks/[id]/deliverables/[deliverableId]/route";
import { POST as uploadFile } from "../../app/api/storage/upload/route";
import { GET as getStorageFile } from "../../app/api/storage/[...key]/route";
// Projects
import { GET as listProjects, POST as createProject } from "../../app/api/projects/route";
import {
  POST as addMember,
  DELETE as removeMember,
} from "../../app/api/projects/[id]/members/route";
// Task review
import { POST as approveTask } from "../../app/api/tasks/[id]/approve/route";
import { POST as rejectTask } from "../../app/api/tasks/[id]/reject/route";
import { POST as requestClarification } from "../../app/api/tasks/[id]/request-clarification/route";
// Reactions
import { POST as reactToMessage } from "../../app/api/messages/[id]/reactions/route";
// Notifications
import { GET as listNotifications } from "../../app/api/notifications/route";
import { POST as markDelivered } from "../../app/api/notifications/mark-delivered/route";
// Queue
import { GET as listQueue, POST as createQueueItem } from "../../app/api/queue/route";
import {
  PATCH as updateQueueItem,
  DELETE as deleteQueueItem,
} from "../../app/api/queue/[id]/route";
// Board
import { GET as getBoard } from "../../app/api/tasks/board/route";
// Pending review
import { GET as getPendingReview } from "../../app/api/tasks/pending-review/route";
// Events ingest
import { POST as ingestEvent } from "../../app/api/events/ingest/route";
// Health / Auth status
import { GET as getHealth } from "../../app/api/health/route";
import { GET as getAuthStatus } from "../../app/api/auth/status/route";
// Project context
import { GET as getProjectContext } from "../../app/api/projects/[id]/context/route";
// Agent key regeneration
import { POST as regenerateKey } from "../../app/api/agents/[id]/regenerate-key/route";

// ════════════════════════════════════════════════════════════════════
// 1. FIRST-TIME SERVER SETUP
// ════════════════════════════════════════════════════════════════════

describe("1. First-Time Server Setup", () => {
  // Each attempt uses a unique IP to avoid hitting the rate limit (3/60s)
  it("rejects setup with short username", async () => {
    const res = await adminSetup("ab", "password123", "10.1.0.1");
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/username/i);
  });

  it("rejects setup with short password", async () => {
    const res = await adminSetup("admin", "short", "10.1.0.2");
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/password/i);
  });

  it("creates admin account and returns session cookie", async () => {
    const res = await adminSetup("admin", "securepass123", "10.1.0.3");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);

    sessionCookie = extractSessionCookie(res)!;
    expect(sessionCookie).toBeTruthy();
    expect(sessionCookie.length).toBeGreaterThan(20); // JWT is long
  });

  it("cannot setup again — admin already exists", async () => {
    const res = await adminSetup("hacker", "tryagain123", "10.1.0.4");
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toMatch(/already exists/i);
  });
});

// ════════════════════════════════════════════════════════════════════
// 2. AUTH: LOGIN, LOGOUT, BRUTE FORCE
// ════════════════════════════════════════════════════════════════════

describe("2. Auth & Brute Force", () => {
  it("rejects login with wrong password", async () => {
    const res = await adminLogin("admin", "wrongpassword", "10.2.0.1");
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.error).toBe("Invalid credentials");
  });

  it("rejects login with nonexistent user", async () => {
    const res = await adminLogin("ghost", "doesntmatter", "10.2.0.2");
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.error).toBe("Invalid credentials");
  });

  it("rate limits after 5 failed login attempts from same IP", async () => {
    const bruteIp = "10.99.99.99";

    // Burn through 5 allowed attempts
    for (let i = 0; i < 5; i++) {
      await adminLogin("admin", "wrong", bruteIp);
    }

    // 6th attempt should be rate limited
    const res = await adminLogin("admin", "wrong", bruteIp);
    expect(res.status).toBe(429);

    const data = await res.json();
    expect(data.error).toMatch(/too many/i);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("rate limits even correct credentials from brute-force IP", async () => {
    const res = await adminLogin("admin", "securepass123", "10.99.99.99");
    expect(res.status).toBe(429);
  });

  it("logs in successfully from a clean IP", async () => {
    const res = await adminLogin("admin", "securepass123", "10.2.0.50");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.username).toBe("admin");

    const cookie = extractSessionCookie(res);
    expect(cookie).toBeTruthy();
    sessionCookie = cookie!;
  });

  it("logs out and clears cookie", async () => {
    const res = await adminLogout();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("can log back in after logout", async () => {
    const res = await adminLogin("admin", "securepass123", "10.2.0.51");
    expect(res.status).toBe(200);
    sessionCookie = extractSessionCookie(res)!;
  });

  it("login is case-insensitive for username", async () => {
    const res = await adminLogin("ADMIN", "securepass123", "10.2.0.52");
    expect(res.status).toBe(200);
  });
});

// ════════════════════════════════════════════════════════════════════
// 3. AGENT MANAGEMENT
// ════════════════════════════════════════════════════════════════════

describe("3. Agent Management", () => {
  it("creates Rex — frontend dev", async () => {
    const req = buildRequest("POST", "/api/agents/create", {
      body: {
        name: "Rex",
        role: "Frontend Developer",
        username: "rex",
        templateId: "frontend-dev",
      },
    });

    const res = await callRoute(createAgent, req);
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.agent.name).toBe("Rex");
    expect(data.agent.role).toBe("Frontend Developer");
    expect(data.agent.setupStatus).toBe(SetupStatus.PENDING_SETUP);
    expect(data.apiKey).toMatch(/^mc_/);
    expect(data.apiKey.length).toBe(67); // mc_ + 64 hex chars
    expect(data.configFiles).toBeDefined();
    expect(data.cronCommand).toBeDefined();

    rexApiKey = data.apiKey;
    rexAgentId = data.agent.id;
  });

  it("creates Nova — researcher", async () => {
    const req = buildRequest("POST", "/api/agents/create", {
      body: {
        name: "Nova",
        role: "Research Analyst",
        username: "nova",
      },
    });

    const res = await callRoute(createAgent, req);
    expect(res.status).toBe(201);

    const data = await res.json();
    novaApiKey = data.apiKey;
    novaAgentId = data.agent.id;
  });

  it("rejects duplicate username — 409", async () => {
    const req = buildRequest("POST", "/api/agents/create", {
      body: { name: "Fake Rex", role: "Impostor", username: "rex" },
    });

    const res = await callRoute(createAgent, req);
    expect(res.status).toBe(409);

    const data = await res.json();
    expect(data.error).toMatch(/already taken/i);
  });

  it("rejects agent creation without name — 400", async () => {
    const req = buildRequest("POST", "/api/agents/create", {
      body: { role: "Developer" },
    });

    const res = await callRoute(createAgent, req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/name/i);
  });

  it("activates Rex (simulates setup completion)", async () => {
    // In production, the agent's bootstrap process calls the setup endpoint.
    // Here we flip the status directly so Rex can use the API.
    await prisma.agent.update({
      where: { id: rexAgentId },
      data: { setupStatus: SetupStatus.ACTIVE },
    });
    // Clear the agent cache so resolveAgent picks up the new status
    agentCache.clear();
  });

  it("activates Nova", async () => {
    await prisma.agent.update({
      where: { id: novaAgentId },
      data: { setupStatus: SetupStatus.ACTIVE },
    });
    agentCache.clear();
  });

  it("resolves agent profile IDs for later assertions", async () => {
    rexProfileId = await getOrCreateAgentProfileId(rexAgentId);
    novaProfileId = await getOrCreateAgentProfileId(novaAgentId);
    expect(rexProfileId).toBeTruthy();
    expect(novaProfileId).toBeTruthy();
  });

  it("Rex can access /agents/me with API key", async () => {
    const req = buildRequest("GET", "/api/agents/me", { apiKey: rexApiKey });
    const res = await callRoute(getMe, req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.name).toBe("Rex");
    expect(data.username).toBe("rex");
    expect(data.role).toBe("Frontend Developer");
  });

  it("Rex can list all agents", async () => {
    const req = buildRequest("GET", "/api/agents", { apiKey: rexApiKey });
    const res = await callRoute(listAgents, req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.length).toBeGreaterThanOrEqual(2);

    const names = data.map((a: any) => a.name);
    expect(names).toContain("Rex");
    expect(names).toContain("Nova");

    // Should not expose sensitive fields
    expect(data[0].apiKeyHash).toBeUndefined();
  });

  it("rejects request with no auth header — 401", async () => {
    const req = buildRequest("GET", "/api/agents/me");
    const res = await callRoute(getMe, req);
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.error).toMatch(/authorization/i);
  });

  it("rejects request with invalid API key — 401", async () => {
    const req = buildRequest("GET", "/api/agents/me", {
      apiKey: "mc_0000000000000000000000000000000000000000000000000000000000000000",
    });
    const res = await callRoute(getMe, req);
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.error).toMatch(/invalid/i);
  });

  it("deactivated agent gets 403", async () => {
    await prisma.agent.update({
      where: { id: rexAgentId },
      data: { setupStatus: SetupStatus.DEACTIVATED },
    });
    agentCache.clear();

    const req = buildRequest("GET", "/api/agents/me", { apiKey: rexApiKey });
    const res = await callRoute(getMe, req);
    expect(res.status).toBe(403);

    const data = await res.json();
    expect(data.error).toMatch(/deactivated/i);

    // Re-activate for subsequent tests
    await prisma.agent.update({
      where: { id: rexAgentId },
      data: { setupStatus: SetupStatus.ACTIVE },
    });
    agentCache.clear();
  });

  it("pending_setup agent gets 403", async () => {
    await prisma.agent.update({
      where: { id: rexAgentId },
      data: { setupStatus: SetupStatus.PENDING_SETUP },
    });
    agentCache.clear();

    const req = buildRequest("GET", "/api/agents/me", { apiKey: rexApiKey });
    const res = await callRoute(getMe, req);
    expect(res.status).toBe(403);

    const data = await res.json();
    expect(data.error).toMatch(/setup/i);

    // Re-activate
    await prisma.agent.update({
      where: { id: rexAgentId },
      data: { setupStatus: SetupStatus.ACTIVE },
    });
    agentCache.clear();
  });
});

// ════════════════════════════════════════════════════════════════════
// 4. TASK WORKFLOW
// ════════════════════════════════════════════════════════════════════

describe("4. Task Workflow", () => {
  it("Rex creates a task", async () => {
    const req = buildRequest("POST", "/api/tasks", {
      apiKey: rexApiKey,
      body: {
        title: "Build the landing page",
        description: "Create a responsive hero section with CTA button",
      },
    });

    const res = await callRoute(createTaskHandler, req);
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.title).toBe("Build the landing page");
    expect(data.description).toBe("Create a responsive hero section with CTA button");
    expect(data.status).toBe("inbox");
    expect(data.taskNumber).toBeGreaterThan(0);
    expect(data.createdByProfileId).toBe(rexProfileId);

    taskId = data.id;
  });

  it("created task appears in Rex's task list", async () => {
    const req = buildRequest("GET", "/api/tasks", { apiKey: rexApiKey });
    const res = await callRoute(listTasks, req);
    const data = await res.json();
    expect(data.some((t: any) => t.id === taskId)).toBe(true);
  });

  it("task creation logged in activity feed", async () => {
    const activity = await prisma.activity.findFirst({
      where: { taskId, type: "task_created" },
    });
    expect(activity).toBeDefined();
    expect(activity!.message).toContain("Build the landing page");
    expect(activity!.message).toContain("Rex");
  });

  it("task creator auto-subscribed", async () => {
    const sub = await prisma.subscription.findUnique({
      where: { agentId_taskId: { agentId: rexAgentId, taskId } },
    });
    expect(sub).toBeDefined();
  });

  it("rejects task without title — 400", async () => {
    const req = buildRequest("POST", "/api/tasks", {
      apiKey: rexApiKey,
      body: { description: "Missing title" },
    });

    const res = await callRoute(createTaskHandler, req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/title/i);
  });

  it("rejects task without description — 400", async () => {
    const req = buildRequest("POST", "/api/tasks", {
      apiKey: rexApiKey,
      body: { title: "Missing description" },
    });

    const res = await callRoute(createTaskHandler, req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/description/i);
  });

  it("rejects task creation without auth — 401", async () => {
    const req = buildRequest("POST", "/api/tasks", {
      body: { title: "Sneaky", description: "No auth" },
    });
    const res = await callRoute(createTaskHandler, req);
    expect(res.status).toBe(401);
  });

  it("rejects listing tasks without auth — 401", async () => {
    const req = buildRequest("GET", "/api/tasks");
    const res = await callRoute(listTasks, req);
    expect(res.status).toBe(401);
  });

  it("Rex can list tasks", async () => {
    const req = buildRequest("GET", "/api/tasks", { apiKey: rexApiKey });
    const res = await callRoute(listTasks, req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.length).toBeGreaterThanOrEqual(1);
    expect(data.some((t: any) => t.id === taskId)).toBe(true);
  });

  it("Nova can also see the task (no project scoping)", async () => {
    const req = buildRequest("GET", `/api/tasks/${taskId}`, { apiKey: novaApiKey });
    const res = await callRoute(getTask, req, { id: taskId });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.title).toBe("Build the landing page");
    expect(data.assignees).toBeDefined();
  });

  it("Rex moves task to in_progress", async () => {
    const req = buildRequest("PATCH", `/api/tasks/${taskId}`, {
      apiKey: rexApiKey,
      body: { status: "in_progress" },
    });

    const res = await callRoute(updateTask, req, { id: taskId });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("in_progress");
  });

  it("Rex assigns Nova to the task", async () => {
    const req = buildRequest("PATCH", `/api/tasks/${taskId}`, {
      apiKey: rexApiKey,
      body: { assigneeIds: [novaAgentId] },
    });

    const res = await callRoute(updateTask, req, { id: taskId });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.assignees).toHaveLength(1);
    expect(data.assignees[0].profileId).toBe(novaProfileId);
  });

  it("Nova notified of assignment", async () => {
    const req = buildRequest("GET", "/api/notifications", { apiKey: novaApiKey });
    const res = await callRoute(listNotifications, req);
    const data = await res.json();
    const assignNotif = data.find((n: any) => n.content?.includes("You were added to task"));
    expect(assignNotif).toBeDefined();
    expect(assignNotif.content).toContain("Build the landing page");
  });

  it("Nova auto-subscribed to task after assignment", async () => {
    const sub = await prisma.subscription.findUnique({
      where: { agentId_taskId: { agentId: novaAgentId, taskId } },
    });
    expect(sub).toBeDefined();
  });

  it("assignment logged in activity feed", async () => {
    const activity = await prisma.activity.findFirst({
      where: { taskId, type: NotificationKind.TASK_ASSIGNED },
    });
    expect(activity).toBeDefined();
    expect(activity!.message).toContain("+Nova");
  });

  it("Rex updates task title", async () => {
    const req = buildRequest("PATCH", `/api/tasks/${taskId}`, {
      apiKey: rexApiKey,
      body: { title: "Build the landing page v2" },
    });

    const res = await callRoute(updateTask, req, { id: taskId });
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe("Build the landing page v2");
  });

  it("returns 404 for nonexistent task", async () => {
    const req = buildRequest("GET", "/api/tasks/nonexistent", { apiKey: rexApiKey });
    const res = await callRoute(getTask, req, { id: "nonexistent" });
    expect(res.status).toBe(404);
  });

  it("filters tasks by status", async () => {
    const req = buildRequest("GET", "/api/tasks?status=in_progress", { apiKey: rexApiKey });
    const res = await callRoute(listTasks, req);
    const data = await res.json();

    expect(data.every((t: any) => t.status === "in_progress")).toBe(true);
    expect(data.some((t: any) => t.id === taskId)).toBe(true);
  });

  it("returns 404 when updating nonexistent task", async () => {
    const req = buildRequest("PATCH", "/api/tasks/nonexistent", {
      apiKey: rexApiKey,
      body: { status: TaskStatus.DONE },
    });
    const res = await callRoute(updateTask, req, { id: "nonexistent" });
    expect(res.status).toBe(404);
  });

  it("rejects task update without auth — 401", async () => {
    const req = buildRequest("PATCH", `/api/tasks/${taskId}`, {
      body: { title: "Hijacked" },
    });
    const res = await callRoute(updateTask, req, { id: taskId });
    expect(res.status).toBe(401);
  });

  it("rejects task deletion without auth — 401", async () => {
    const req = buildRequest("DELETE", `/api/tasks/${taskId}`);
    const res = await callRoute(deleteTask, req, { id: taskId });
    expect(res.status).toBe(401);
  });

  it("rejects getting single task without auth — 401", async () => {
    const req = buildRequest("GET", `/api/tasks/${taskId}`);
    const res = await callRoute(getTask, req, { id: taskId });
    expect(res.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════════════
// 5. MESSAGES & MENTIONS
// ════════════════════════════════════════════════════════════════════

describe("5. Messages & Mentions", () => {
  it("Rex posts a message on the task", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/messages`, {
      apiKey: rexApiKey,
      body: { content: "Starting work on the landing page now" },
    });

    const res = await callRoute(createMessage, req, { id: taskId });
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.content).toBe("Starting work on the landing page now");
    expect(data.fromProfileId).toBeTruthy();
    expect(data.fromProfile.displayName).toBe("Rex");
    expect(data.taskId).toBe(taskId);
  });

  it("message appears in task message list", async () => {
    const req = buildRequest("GET", `/api/tasks/${taskId}/messages`, { apiKey: rexApiKey });
    const res = await callRoute(listMessages, req, { id: taskId });
    const data = await res.json();
    expect(data.some((m: any) => m.content === "Starting work on the landing page now")).toBe(true);
  });

  it("message activity logged", async () => {
    const activity = await prisma.activity.findFirst({
      where: { taskId, type: "message_sent" },
    });
    expect(activity).toBeDefined();
    expect(activity!.message).toContain("Rex");
    expect(activity!.message).toContain("commented on");
  });

  it("Rex @mentions Nova in a message", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/messages`, {
      apiKey: rexApiKey,
      body: { content: "Hey @nova can you research competitor landing pages?" },
    });

    const res = await callRoute(createMessage, req, { id: taskId });
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.mentions).toHaveLength(1);
    expect(data.mentions[0].profile.id).toBe(novaProfileId);
    expect(data.mentions[0].profile.displayName).toBe("Nova");
  });

  it("Nova receives mention notification", async () => {
    const req = buildRequest("GET", "/api/notifications", { apiKey: novaApiKey });
    const res = await callRoute(listNotifications, req);
    const data = await res.json();
    const mentionNotif = data.find((n: any) => n.content?.includes("mentioned you"));
    expect(mentionNotif).toBeDefined();
    expect(mentionNotif.content).toContain("Rex");
  });

  it("mentioned agent auto-subscribed to task", async () => {
    const sub = await prisma.subscription.findUnique({
      where: { agentId_taskId: { agentId: novaAgentId, taskId } },
    });
    expect(sub).toBeDefined();
  });

  it("@all mentions all other agents except sender", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/messages`, {
      apiKey: rexApiKey,
      body: { content: "Attention @all — please review the PR" },
    });

    const res = await callRoute(createMessage, req, { id: taskId });
    expect(res.status).toBe(201);

    const data = await res.json();
    const mentionedProfileIds = data.mentions.map((m: any) => m.profile.id);

    // Nova should be mentioned, Rex (sender) should NOT
    expect(mentionedProfileIds).toContain(novaProfileId);
    expect(mentionedProfileIds).not.toContain(rexProfileId);
  });

  it("HTML content is escaped to prevent XSS", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/messages`, {
      apiKey: rexApiKey,
      body: { content: '<img src=x onerror="alert(1)">' },
    });

    const res = await callRoute(createMessage, req, { id: taskId });
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.content).not.toContain("<img");
    expect(data.content).toContain("&lt;img");
    expect(data.content).toContain("&gt;");
  });

  it("rejects message without content — 400", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/messages`, {
      apiKey: rexApiKey,
      body: {},
    });

    const res = await callRoute(createMessage, req, { id: taskId });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/content/i);
  });

  it("rejects message without auth — 401", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/messages`, {
      body: { content: "sneaky" },
    });
    const res = await callRoute(createMessage, req, { id: taskId });
    expect(res.status).toBe(401);
  });

  it("lists messages ordered by createdAt ascending", async () => {
    const req = buildRequest("GET", `/api/tasks/${taskId}/messages`, { apiKey: rexApiKey });
    const res = await callRoute(listMessages, req, { id: taskId });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.length).toBe(4); // 4 messages created above

    // First message should be the earliest
    expect(data[0].content).toBe("Starting work on the landing page now");

    // All messages include fromProfile
    expect(data[0].fromProfile.displayName).toBe("Rex");
    expect(data[0].fromProfile.username).toBe("rex");

    // Timestamps are ascending
    for (let i = 1; i < data.length; i++) {
      expect(new Date(data[i].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(data[i - 1].createdAt).getTime(),
      );
    }
  });

  it("rejects listing messages without auth — 401", async () => {
    const req = buildRequest("GET", `/api/tasks/${taskId}/messages`);
    const res = await callRoute(listMessages, req, { id: taskId });
    expect(res.status).toBe(401);
  });

  it("posting message on nonexistent task — 404", async () => {
    const req = buildRequest("POST", "/api/tasks/nonexistent-task-id/messages", {
      apiKey: rexApiKey,
      body: { content: "This task doesn't exist" },
    });
    const res = await callRoute(createMessage, req, { id: "nonexistent-task-id" });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/task not found/i);
  });

  it("listing messages for nonexistent task returns empty array", async () => {
    const req = buildRequest("GET", "/api/tasks/nonexistent-task-id/messages", {
      apiKey: rexApiKey,
    });
    const res = await callRoute(listMessages, req, { id: "nonexistent-task-id" });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════
// 6. DELIVERABLES — ALL CONTENT TYPES
// ════════════════════════════════════════════════════════════════════
//
// Deliverable kinds: markdown, code, file, link
//   - markdown/code: inline content stored in DB
//   - file: hosted on R2 (storageKey, fileName, mimeType, fileSize)
//   - link: external URL reference
//
// File-type deliverables follow a two-step flow in production:
//   1. POST /api/storage/upload → presigned R2 URL + storage key
//   2. Agent uploads file directly to R2
//   3. POST /api/tasks/{id}/deliverables with storageKey metadata
//
// The deliverable route doesn't verify the file exists in R2,
// so we can test all file types by passing proper metadata.

describe("6. Deliverables — All Content Types", () => {
  // ── 6a. Inline content types ──────────────────────────────────

  it("markdown deliverable — documentation", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
      apiKey: rexApiKey,
      body: {
        title: "Landing Page Design Doc",
        kind: "markdown",
        content:
          "# Hero Section\n\nFull-width hero with gradient background.\n\n## Requirements\n- Responsive\n- Dark mode support",
      },
    });

    const res = await callRoute(createDeliverable, req, { id: taskId });
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.kind).toBe("markdown");
    expect(data.content).toContain("# Hero Section");
    expect(data.version).toBe(1);
    expect(data.storageKey).toBeNull();
    expect(data.fileName).toBeNull();

    deliverableId = data.id;
  });

  it("deliverable appears in task deliverables list", async () => {
    const req = buildRequest("GET", `/api/tasks/${taskId}/deliverables`, { apiKey: rexApiKey });
    const res = await callRoute(listDeliverables, req, { id: taskId });
    const data = await res.json();
    expect(data.some((d: any) => d.title === "Landing Page Design Doc")).toBe(true);
  });

  it("deliverable submission logged in activity feed", async () => {
    const activity = await prisma.activity.findFirst({
      where: { taskId, type: "deliverable_submitted" },
    });
    expect(activity).toBeDefined();
    expect(activity!.message).toContain("submitted");
    expect(activity!.message).toContain("markdown");
  });

  it("code deliverable — TypeScript/React component", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
      apiKey: rexApiKey,
      body: {
        title: "Hero.tsx",
        kind: "code",
        content:
          'export function Hero() {\n  return (\n    <section className="hero">\n      <h1>Welcome</h1>\n    </section>\n  );\n}',
        language: "tsx",
      },
    });

    const res = await callRoute(createDeliverable, req, { id: taskId });
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.kind).toBe("code");
    expect(data.language).toBe("tsx");
    expect(data.content).toContain("export function Hero");
  });

  it("code deliverable — Python script", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
      apiKey: rexApiKey,
      body: {
        title: "scraper.py",
        kind: "code",
        content: "import requests\n\ndef scrape(url):\n    return requests.get(url).text",
        language: "python",
      },
    });

    const res = await callRoute(createDeliverable, req, { id: taskId });
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.language).toBe("python");
  });

  it("code deliverable — SQL query", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
      apiKey: rexApiKey,
      body: {
        title: "analytics-query.sql",
        kind: "code",
        content:
          "SELECT agent_id, COUNT(*) as task_count\nFROM tasks\nGROUP BY agent_id\nORDER BY task_count DESC;",
        language: "sql",
      },
    });

    const res = await callRoute(createDeliverable, req, { id: taskId });
    expect(res.status).toBe(201);
    expect((await res.json()).language).toBe("sql");
  });

  it("code deliverable — JSON config", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
      apiKey: rexApiKey,
      body: {
        title: "tsconfig.json",
        kind: "code",
        content: '{\n  "compilerOptions": {\n    "target": "ES2022",\n    "strict": true\n  }\n}',
        language: "json",
      },
    });

    const res = await callRoute(createDeliverable, req, { id: taskId });
    expect(res.status).toBe(201);
    expect((await res.json()).language).toBe("json");
  });

  it("code deliverable — CSS stylesheet", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
      apiKey: rexApiKey,
      body: {
        title: "hero.css",
        kind: "code",
        content:
          ".hero {\n  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\n  min-height: 100vh;\n}",
        language: "css",
      },
    });

    const res = await callRoute(createDeliverable, req, { id: taskId });
    expect(res.status).toBe(201);
    expect((await res.json()).language).toBe("css");
  });

  // ── 6b. File types — R2-hosted (images) ──────────────────────

  it("file deliverable — PNG image", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
      apiKey: rexApiKey,
      body: {
        title: "Homepage Mockup",
        kind: "file",
        storageKey: "deliverables/1707000001-homepage-mockup.png",
        fileName: "homepage-mockup.png",
        mimeType: "image/png",
        fileSize: 2_048_576, // 2 MB
      },
    });

    const res = await callRoute(createDeliverable, req, { id: taskId });
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.kind).toBe("file");
    expect(data.storageKey).toBe("deliverables/1707000001-homepage-mockup.png");
    expect(data.fileName).toBe("homepage-mockup.png");
    expect(data.mimeType).toBe("image/png");
    expect(data.fileSize).toBe(2_048_576);
    expect(data.content).toBeNull();
    expect(data.language).toBeNull();
  });

  it("file deliverable — JPEG photo", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
      apiKey: rexApiKey,
      body: {
        title: "Team Photo",
        kind: "file",
        storageKey: "deliverables/1707000002-team-photo.jpg",
        fileName: "team-photo.jpg",
        mimeType: "image/jpeg",
        fileSize: 1_524_000,
      },
    });

    const res = await callRoute(createDeliverable, req, { id: taskId });
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.mimeType).toBe("image/jpeg");
    expect(data.fileName).toBe("team-photo.jpg");
  });

  it("file deliverable — GIF animation", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
      apiKey: rexApiKey,
      body: {
        title: "Loading Spinner Animation",
        kind: "file",
        storageKey: "deliverables/1707000003-spinner.gif",
        fileName: "spinner.gif",
        mimeType: "image/gif",
        fileSize: 512_000,
      },
    });

    const res = await callRoute(createDeliverable, req, { id: taskId });
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.mimeType).toBe("image/gif");
    expect(data.fileName).toBe("spinner.gif");
  });

  it("file deliverable — SVG vector graphic", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
      apiKey: rexApiKey,
      body: {
        title: "Company Logo",
        kind: "file",
        storageKey: "deliverables/1707000004-logo.svg",
        fileName: "logo.svg",
        mimeType: "image/svg+xml",
        fileSize: 8_200,
      },
    });

    const res = await callRoute(createDeliverable, req, { id: taskId });
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.mimeType).toBe("image/svg+xml");
  });

  it("file deliverable — WebP image", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
      apiKey: rexApiKey,
      body: {
        title: "Optimized Banner",
        kind: "file",
        storageKey: "deliverables/1707000005-banner.webp",
        fileName: "banner.webp",
        mimeType: "image/webp",
        fileSize: 340_000,
      },
    });

    const res = await callRoute(createDeliverable, req, { id: taskId });
    expect(res.status).toBe(201);
    expect((await res.json()).mimeType).toBe("image/webp");
  });

  // ── 6c. File types — R2-hosted (documents) ───────────────────

  it("file deliverable — PDF document", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
      apiKey: rexApiKey,
      body: {
        title: "Brand Guidelines",
        kind: "file",
        storageKey: "deliverables/1707000010-brand-guidelines.pdf",
        fileName: "brand-guidelines.pdf",
        mimeType: "application/pdf",
        fileSize: 5_242_880, // 5 MB
      },
    });

    const res = await callRoute(createDeliverable, req, { id: taskId });
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.mimeType).toBe("application/pdf");
    expect(data.fileSize).toBe(5_242_880);
  });

  it("file deliverable — CSV spreadsheet", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
      apiKey: rexApiKey,
      body: {
        title: "SEO Keywords Export",
        kind: "file",
        storageKey: "deliverables/1707000011-keywords.csv",
        fileName: "keywords.csv",
        mimeType: "text/csv",
        fileSize: 45_000,
      },
    });

    const res = await callRoute(createDeliverable, req, { id: taskId });
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.mimeType).toBe("text/csv");
    expect(data.fileName).toBe("keywords.csv");
  });

  it("file deliverable — plain text file", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
      apiKey: rexApiKey,
      body: {
        title: "Deployment Notes",
        kind: "file",
        storageKey: "deliverables/1707000012-notes.txt",
        fileName: "deployment-notes.txt",
        mimeType: "text/plain",
        fileSize: 2_400,
      },
    });

    const res = await callRoute(createDeliverable, req, { id: taskId });
    expect(res.status).toBe(201);
    expect((await res.json()).mimeType).toBe("text/plain");
  });

  // ── 6d. File types — R2-hosted (media) ────────────────────────

  it("file deliverable — MP4 video", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
      apiKey: rexApiKey,
      body: {
        title: "Product Demo Recording",
        kind: "file",
        storageKey: "deliverables/1707000020-demo.mp4",
        fileName: "product-demo.mp4",
        mimeType: "video/mp4",
        fileSize: 52_428_800, // 50 MB
      },
    });

    const res = await callRoute(createDeliverable, req, { id: taskId });
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.mimeType).toBe("video/mp4");
    expect(data.fileSize).toBe(52_428_800);
  });

  it("file deliverable — WebM video", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
      apiKey: rexApiKey,
      body: {
        title: "Screen Recording",
        kind: "file",
        storageKey: "deliverables/1707000021-screen.webm",
        fileName: "screen-recording.webm",
        mimeType: "video/webm",
        fileSize: 15_000_000,
      },
    });

    const res = await callRoute(createDeliverable, req, { id: taskId });
    expect(res.status).toBe(201);
    expect((await res.json()).mimeType).toBe("video/webm");
  });

  it("file deliverable — MP3 audio", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
      apiKey: rexApiKey,
      body: {
        title: "Podcast Episode Draft",
        kind: "file",
        storageKey: "deliverables/1707000022-podcast.mp3",
        fileName: "episode-draft.mp3",
        mimeType: "audio/mpeg",
        fileSize: 8_000_000,
      },
    });

    const res = await callRoute(createDeliverable, req, { id: taskId });
    expect(res.status).toBe(201);
    expect((await res.json()).mimeType).toBe("audio/mpeg");
  });

  it("file deliverable — WAV audio", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
      apiKey: rexApiKey,
      body: {
        title: "Sound Effect",
        kind: "file",
        storageKey: "deliverables/1707000023-sfx.wav",
        fileName: "notification.wav",
        mimeType: "audio/wav",
        fileSize: 1_200_000,
      },
    });

    const res = await callRoute(createDeliverable, req, { id: taskId });
    expect(res.status).toBe(201);
    expect((await res.json()).mimeType).toBe("audio/wav");
  });

  // ── 6e. File types — R2-hosted (archives & misc) ──────────────

  it("file deliverable — ZIP archive", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
      apiKey: rexApiKey,
      body: {
        title: "Design Assets Bundle",
        kind: "file",
        storageKey: "deliverables/1707000030-assets.zip",
        fileName: "design-assets.zip",
        mimeType: "application/zip",
        fileSize: 25_000_000,
      },
    });

    const res = await callRoute(createDeliverable, req, { id: taskId });
    expect(res.status).toBe(201);
    expect((await res.json()).mimeType).toBe("application/zip");
  });

  it("file deliverable — Figma/Sketch design file", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
      apiKey: rexApiKey,
      body: {
        title: "UI Kit Source File",
        kind: "file",
        storageKey: "deliverables/1707000031-ui-kit.fig",
        fileName: "ui-kit.fig",
        mimeType: "application/octet-stream",
        fileSize: 12_000_000,
      },
    });

    const res = await callRoute(createDeliverable, req, { id: taskId });
    expect(res.status).toBe(201);
    expect((await res.json()).mimeType).toBe("application/octet-stream");
  });

  // ── 6f. Link types ────────────────────────────────────────────

  it("link deliverable — Figma design URL", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
      apiKey: rexApiKey,
      body: {
        title: "Figma Design",
        kind: "link",
        url: "https://figma.com/file/abc123/Landing-Page",
      },
    });

    const res = await callRoute(createDeliverable, req, { id: taskId });
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.kind).toBe("link");
    expect(data.url).toBe("https://figma.com/file/abc123/Landing-Page");
    expect(data.storageKey).toBeNull();
    expect(data.content).toBeNull();
  });

  it("link deliverable — YouTube video", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
      apiKey: rexApiKey,
      body: {
        title: "Tutorial Reference",
        kind: "link",
        url: "https://youtube.com/watch?v=dQw4w9WgXcQ",
      },
    });

    const res = await callRoute(createDeliverable, req, { id: taskId });
    expect(res.status).toBe(201);
    expect((await res.json()).url).toContain("youtube.com");
  });

  it("link deliverable — Loom recording", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
      apiKey: rexApiKey,
      body: {
        title: "Design Walkthrough",
        kind: "link",
        url: "https://www.loom.com/share/abc123def456",
      },
    });

    const res = await callRoute(createDeliverable, req, { id: taskId });
    expect(res.status).toBe(201);
    expect((await res.json()).url).toContain("loom.com");
  });

  it("link deliverable — Google Docs", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
      apiKey: rexApiKey,
      body: {
        title: "Content Brief",
        kind: "link",
        url: "https://docs.google.com/document/d/1abc/edit",
      },
    });

    const res = await callRoute(createDeliverable, req, { id: taskId });
    expect(res.status).toBe(201);
    expect((await res.json()).url).toContain("docs.google.com");
  });

  // ── 6g. Listing all deliverables ──────────────────────────────

  it("lists all deliverables — every type is persisted", async () => {
    const req = buildRequest("GET", `/api/tasks/${taskId}/deliverables`, { apiKey: rexApiKey });
    const res = await callRoute(listDeliverables, req, { id: taskId });
    expect(res.status).toBe(200);

    const data = await res.json();
    // markdown(1) + code(5) + file images(5) + file docs(3) + file media(4) + file archives(2) + links(4) = 24
    expect(data.length).toBe(24);

    // Verify mix of kinds
    const kinds = new Set(data.map((d: any) => d.kind));
    expect(kinds).toEqual(new Set(["markdown", "code", "file", "link"]));

    // Verify file types have R2 metadata
    const fileDeliverables = data.filter((d: any) => d.kind === "file");
    for (const f of fileDeliverables) {
      expect(f.storageKey).toBeTruthy();
      expect(f.fileName).toBeTruthy();
      expect(f.mimeType).toBeTruthy();
      expect(f.fileSize).toBeGreaterThan(0);
    }

    // Verify link types have URLs
    const linkDeliverables = data.filter((d: any) => d.kind === "link");
    for (const l of linkDeliverables) {
      expect(l.url).toMatch(/^https:\/\//);
    }

    // Every deliverable has profile info
    for (const d of data) {
      expect(d.profile.displayName).toBe("Rex");
    }
  });

  // ── 6h. Validation ────────────────────────────────────────────

  it("rejects deliverable without title — 400", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
      apiKey: rexApiKey,
      body: { kind: "markdown", content: "no title" },
    });

    const res = await callRoute(createDeliverable, req, { id: taskId });
    expect(res.status).toBe(400);
  });

  it("rejects deliverable without kind — 400", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
      apiKey: rexApiKey,
      body: { title: "No Kind" },
    });

    const res = await callRoute(createDeliverable, req, { id: taskId });
    expect(res.status).toBe(400);
  });

  it("rejects deliverable without auth — 401", async () => {
    const req = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
      body: { title: "Sneaky", kind: "markdown" },
    });

    const res = await callRoute(createDeliverable, req, { id: taskId });
    expect(res.status).toBe(401);
  });

  it("rejects listing deliverables without auth — 401", async () => {
    const req = buildRequest("GET", `/api/tasks/${taskId}/deliverables`);
    const res = await callRoute(listDeliverables, req, { id: taskId });
    expect(res.status).toBe(401);
  });

  it("creating deliverable on nonexistent task — 404", async () => {
    const req = buildRequest("POST", "/api/tasks/nonexistent-task-id/deliverables", {
      apiKey: rexApiKey,
      body: { title: "Ghost deliverable", kind: "markdown", content: "orphan" },
    });
    const res = await callRoute(createDeliverable, req, { id: "nonexistent-task-id" });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/task not found/i);
  });

  it("listing deliverables for nonexistent task returns empty array", async () => {
    const req = buildRequest("GET", "/api/tasks/nonexistent-task-id/deliverables", {
      apiKey: rexApiKey,
    });
    const res = await callRoute(listDeliverables, req, { id: "nonexistent-task-id" });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toEqual([]);
  });

  it("updating deliverable on wrong task — 400", async () => {
    // deliverableId belongs to taskId, try to update it via a different task ID
    const req = buildRequest("PATCH", `/api/tasks/wrong-task-id/deliverables/${deliverableId}`, {
      apiKey: rexApiKey,
      body: { title: "Mismatched task" },
    });
    const res = await callRoute(updateDeliverable, req, {
      id: "wrong-task-id",
      deliverableId,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/does not belong/i);
  });

  it("updating deliverable without auth — 401", async () => {
    const req = buildRequest("PATCH", `/api/tasks/${taskId}/deliverables/${deliverableId}`, {
      body: { title: "No auth" },
    });
    const res = await callRoute(updateDeliverable, req, {
      id: taskId,
      deliverableId,
    });
    expect(res.status).toBe(401);
  });

  // ── 6i. Versioning & ownership ────────────────────────────────

  it("Rex updates the markdown deliverable — version incremented", async () => {
    const req = buildRequest("PATCH", `/api/tasks/${taskId}/deliverables/${deliverableId}`, {
      apiKey: rexApiKey,
      body: {
        title: "Landing Page Design Doc v2",
        content: "# Hero Section v2\n\nUpdated with animation specs and dark mode",
      },
    });

    const res = await callRoute(updateDeliverable, req, {
      id: taskId,
      deliverableId,
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.title).toBe("Landing Page Design Doc v2");
    expect(data.version).toBe(2);
  });

  it("deliverable revision logged in activity feed", async () => {
    const activities = await prisma.activity.findMany({
      where: { taskId, type: "deliverable_submitted" },
      orderBy: { createdAt: "desc" },
    });
    // Most recent should be the revision
    expect(activities.length).toBeGreaterThanOrEqual(2);
    expect(activities[0].message).toContain("revised");
  });

  it("version snapshot preserves the old state", async () => {
    const versions = await prisma.deliverableVersion.findMany({
      where: { deliverableId },
    });

    expect(versions).toHaveLength(1);
    expect(versions[0].version).toBe(1);
    expect(versions[0].title).toBe("Landing Page Design Doc");
    expect(versions[0].content).toContain("# Hero Section");
    expect(versions[0].editedByProfileId).toBeTruthy();
  });

  it("Nova cannot update Rex's deliverable — 403", async () => {
    const req = buildRequest("PATCH", `/api/tasks/${taskId}/deliverables/${deliverableId}`, {
      apiKey: novaApiKey,
      body: { title: "Hijacked!" },
    });

    const res = await callRoute(updateDeliverable, req, {
      id: taskId,
      deliverableId,
    });
    expect(res.status).toBe(403);
  });

  it("rejects update for nonexistent deliverable — 404", async () => {
    const req = buildRequest("PATCH", `/api/tasks/${taskId}/deliverables/fake-id`, {
      apiKey: rexApiKey,
      body: { title: "Ghost" },
    });

    const res = await callRoute(updateDeliverable, req, {
      id: taskId,
      deliverableId: "fake-id",
    });
    expect(res.status).toBe(404);
  });

  it("file deliverable can be revised with a new file upload", async () => {
    // First, create a PNG file deliverable
    const createReq = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
      apiKey: rexApiKey,
      body: {
        title: "Screenshot v1",
        kind: "file",
        storageKey: "deliverables/1707000040-screenshot-v1.png",
        fileName: "screenshot-v1.png",
        mimeType: "image/png",
        fileSize: 500_000,
      },
    });
    const createRes = await callRoute(createDeliverable, createReq, { id: taskId });
    const created = await createRes.json();
    expect(created.version).toBe(1);

    // Revise it with a new file (simulates re-upload to R2 with new key)
    const updateReq = buildRequest("PATCH", `/api/tasks/${taskId}/deliverables/${created.id}`, {
      apiKey: rexApiKey,
      body: {
        title: "Screenshot v2 — Updated",
        storageKey: "deliverables/1707000041-screenshot-v2.png",
        fileName: "screenshot-v2.png",
        fileSize: 620_000,
      },
    });

    const updateRes = await callRoute(updateDeliverable, updateReq, {
      id: taskId,
      deliverableId: created.id,
    });
    expect(updateRes.status).toBe(200);

    const updated = await updateRes.json();
    expect(updated.version).toBe(2);
    expect(updated.storageKey).toBe("deliverables/1707000041-screenshot-v2.png");
    expect(updated.fileName).toBe("screenshot-v2.png");
    expect(updated.fileSize).toBe(620_000);
    expect(updated.mimeType).toBe("image/png"); // unchanged

    // Old version snapshot should have v1 storage key
    const versions = await prisma.deliverableVersion.findMany({
      where: { deliverableId: created.id },
    });
    expect(versions).toHaveLength(1);
    expect(versions[0].storageKey).toBe("deliverables/1707000040-screenshot-v1.png");
    expect(versions[0].fileName).toBe("screenshot-v1.png");
  });
});

// ════════════════════════════════════════════════════════════════════
// 6½. REAL R2 STORAGE — UPLOAD, DOWNLOAD, VERIFY
// ════════════════════════════════════════════════════════════════════
//
// Tests the full file lifecycle with REAL R2 uploads:
//   1. POST /api/storage/upload → presigned URL + storage key
//   2. PUT file bytes to the presigned URL (real R2 upload)
//   3. POST /api/tasks/{id}/deliverables with the real storage key
//   4. GET /api/storage/{key} → redirect to presigned download URL
//   5. Fetch the download URL → verify bytes match what was uploaded
//   6. Verify files appear in task deliverable listings
//   7. Clean up test files from R2
//
// Uses small in-memory test files to keep uploads fast.
// Run only when R2 credentials exist AND RUN_R2_E2E is set (e.g. in CI). Skip by default to avoid
// SSL/network failures when credentials are present but the environment cannot reach R2.
const r2Configured =
  !!process.env.R2_ACCOUNT_ID &&
  !!process.env.R2_ACCESS_KEY_ID &&
  !!process.env.R2_SECRET_ACCESS_KEY &&
  (process.env.RUN_R2_E2E === "true" || process.env.RUN_R2_E2E === "1");

describe.skipIf(!r2Configured)("6½. Real R2 Storage — Upload, Download, Verify", () => {
  // Track keys for R2 cleanup
  const uploadedKeys: string[] = [];

  // Small test files generated in memory
  const testFiles: Record<
    string,
    { name: string; mime: string; content: Buffer; storageKey?: string; uploadUrl?: string }
  > = {
    text: {
      name: "test-notes.txt",
      mime: "text/plain",
      content: Buffer.from(
        "Hello from Mission Control integration test!\nLine 2: verifying real R2 upload.\nLine 3: this content should survive the round trip.",
      ),
    },
    csv: {
      name: "test-data.csv",
      mime: "text/csv",
      content: Buffer.from(
        "name,role,status\nRex,Frontend Developer,active\nNova,Research Analyst,active\nKia,Squad Lead,active",
      ),
    },
    svg: {
      name: "test-icon.svg",
      mime: "image/svg+xml",
      content: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#667eea"/><text x="12" y="16" text-anchor="middle" fill="white" font-size="12">MC</text></svg>',
      ),
    },
    json: {
      name: "test-config.json",
      mime: "application/json",
      content: Buffer.from(
        JSON.stringify(
          { project: "mission-control", version: 1, agents: ["rex", "nova"], test: true },
          null,
          2,
        ),
      ),
    },
    binary: {
      name: "test-blob.bin",
      mime: "application/octet-stream",
      // 256 bytes of sequential binary data (not a valid image, but tests raw byte round-trip)
      content: Buffer.from(Array.from({ length: 256 }, (_, i) => i)),
    },
  };

  // ── Step 1: Get presigned upload URLs from the API ────────────

  for (const [_label, file] of Object.entries(testFiles)) {
    it(`gets presigned upload URL for ${file.name}`, async () => {
      const req = buildRequest("POST", "/api/storage/upload", {
        apiKey: rexApiKey,
        body: { fileName: file.name, mimeType: file.mime },
      });

      const res = await callRoute(uploadFile, req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.key).toMatch(
        new RegExp(`^deliverables/\\d+-${file.name.replace(/\./g, "\\.")}$`),
      );
      expect(data.uploadUrl).toBeTruthy();
      // Presigned URL should point to R2
      expect(data.uploadUrl).toContain("r2.cloudflarestorage.com");

      file.storageKey = data.key;
      file.uploadUrl = data.uploadUrl;
      uploadedKeys.push(data.key);
    });
  }

  // ── Step 2: Upload files to R2 via presigned URLs ─────────────

  for (const [_label, file] of Object.entries(testFiles)) {
    it(`uploads ${file.name} (${file.content.length} bytes) to R2`, async () => {
      expect(file.uploadUrl).toBeTruthy(); // presigned URL from step 1

      const res = await fetch(file.uploadUrl!, {
        method: "PUT",
        headers: {
          "Content-Type": file.mime,
          "Content-Length": String(file.content.length),
        },
        body: new Uint8Array(file.content),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          `R2 upload failed for ${file.name}: ${res.status} ${res.statusText} — ${text}`,
        );
      }
    }, 60_000); // 60s timeout for network calls
  }

  // ── Step 3: Create file deliverables with real storage keys ───

  for (const [_label, file] of Object.entries(testFiles)) {
    it(`creates deliverable for ${file.name} with real R2 key`, async () => {
      expect(file.storageKey).toBeTruthy();

      const req = buildRequest("POST", `/api/tasks/${taskId}/deliverables`, {
        apiKey: rexApiKey,
        body: {
          title: `R2 Upload: ${file.name}`,
          kind: "file",
          storageKey: file.storageKey,
          fileName: file.name,
          mimeType: file.mime,
          fileSize: file.content.length,
        },
      });

      const res = await callRoute(createDeliverable, req, { id: taskId });
      expect(res.status).toBe(201);

      const data = await res.json();
      expect(data.kind).toBe("file");
      expect(data.storageKey).toBe(file.storageKey);
      expect(data.fileName).toBe(file.name);
      expect(data.mimeType).toBe(file.mime);
      expect(data.fileSize).toBe(file.content.length);
    });
  }

  // ── Step 4: Download files and verify content matches ─────────

  for (const [_label, file] of Object.entries(testFiles)) {
    it(`downloads ${file.name} from R2 and verifies byte-for-byte content`, async () => {
      const keySegments = file.storageKey!.split("/");
      const req = buildRequest("GET", `/api/storage/${file.storageKey}`, { apiKey: rexApiKey });
      const res = await callRoute(getStorageFile, req, { key: keySegments });

      // Route returns a redirect to the presigned download URL
      expect(res.status).toBe(307);
      const downloadUrl = res.headers.get("Location");
      expect(downloadUrl).toBeTruthy();
      expect(downloadUrl).toContain("r2.cloudflarestorage.com");

      // Fetch the actual file from R2
      const fileRes = await fetch(downloadUrl!);
      expect(fileRes.ok).toBe(true);

      // Verify content matches byte-for-byte
      const downloaded = Buffer.from(await fileRes.arrayBuffer());
      expect(downloaded.length).toBe(file.content.length);
      expect(downloaded.equals(file.content)).toBe(true);
    }, 30_000);
  }

  // ── Step 5: Verify uploaded files appear in task deliverables ──

  it("all R2-uploaded files appear in task deliverable listing", async () => {
    const req = buildRequest("GET", `/api/tasks/${taskId}/deliverables`, { apiKey: rexApiKey });
    const res = await callRoute(listDeliverables, req, { id: taskId });
    expect(res.status).toBe(200);

    const data = await res.json();
    const r2Deliverables = data.filter(
      (d: any) => d.title?.startsWith("R2 Upload:") && d.kind === "file",
    );

    // Should have one deliverable per test file
    expect(r2Deliverables).toHaveLength(Object.keys(testFiles).length);

    for (const file of Object.values(testFiles)) {
      const match = r2Deliverables.find((d: any) => d.fileName === file.name);
      expect(match).toBeDefined();
      expect(match.storageKey).toBe(file.storageKey);
      expect(match.mimeType).toBe(file.mime);
      expect(match.fileSize).toBe(file.content.length);
      expect(match.agent.name).toBe("Rex");
    }
  });

  // ── Step 6: Validation (no mocking needed) ────────────────────

  it("rejects upload without fileName — 400", async () => {
    const req = buildRequest("POST", "/api/storage/upload", {
      apiKey: rexApiKey,
      body: { mimeType: "image/png" },
    });

    const res = await callRoute(uploadFile, req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/fileName/i);
  });

  it("rejects upload without mimeType — 400", async () => {
    const req = buildRequest("POST", "/api/storage/upload", {
      apiKey: rexApiKey,
      body: { fileName: "test.png" },
    });

    const res = await callRoute(uploadFile, req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/mimeType/i);
  });

  it("rejects upload without auth — 401", async () => {
    const req = buildRequest("POST", "/api/storage/upload", {
      body: { fileName: "test.png", mimeType: "image/png" },
    });

    const res = await callRoute(uploadFile, req);
    expect(res.status).toBe(401);
  });

  it("rejects upload with invalid API key — 401", async () => {
    const req = buildRequest("POST", "/api/storage/upload", {
      apiKey: "mc_0000000000000000000000000000000000000000000000000000000000000000",
      body: { fileName: "test.png", mimeType: "image/png" },
    });

    const res = await callRoute(uploadFile, req);
    expect(res.status).toBe(401);
  });

  it("rejects download without auth — 401", async () => {
    const req = buildRequest("GET", `/api/storage/deliverables/some-file.txt`);
    const res = await callRoute(getStorageFile, req, { key: ["deliverables", "some-file.txt"] });
    expect(res.status).toBe(401);
  });

  it("rejects download with invalid API key — 401", async () => {
    const req = buildRequest("GET", `/api/storage/deliverables/some-file.txt`, {
      apiKey: "mc_0000000000000000000000000000000000000000000000000000000000000000",
    });
    const res = await callRoute(getStorageFile, req, { key: ["deliverables", "some-file.txt"] });
    expect(res.status).toBe(401);
  });

  it("downloading nonexistent key — R2 returns error on fetch", async () => {
    // The route generates a presigned URL even for keys that don't exist in R2
    const req = buildRequest("GET", `/api/storage/deliverables/this-file-does-not-exist.txt`, {
      apiKey: rexApiKey,
    });
    const res = await callRoute(getStorageFile, req, {
      key: ["deliverables", "this-file-does-not-exist.txt"],
    });

    // Route still returns redirect (presigned URL generation doesn't check existence)
    expect(res.status).toBe(307);
    const downloadUrl = res.headers.get("Location")!;
    expect(downloadUrl).toBeTruthy();

    // But the actual R2 fetch should fail — file doesn't exist
    const fileRes = await fetch(downloadUrl);
    expect(fileRes.ok).toBe(false);
  }, 30_000);

  // ── Step 7: Cleanup — delete test files from R2 ───────────────

  it("cleans up all test files from R2", async () => {
    for (const key of uploadedKeys) {
      await deleteFile(key);
    }

    // Verify at least one file is actually gone by trying to download it
    const firstKey = uploadedKeys[0];
    const keySegments = firstKey.split("/");
    const req = buildRequest("GET", `/api/storage/${firstKey}`, { apiKey: rexApiKey });
    const res = await callRoute(getStorageFile, req, { key: keySegments });

    // Route still generates a redirect (presigned URL works even for missing files)
    expect(res.status).toBe(307);
    const downloadUrl = res.headers.get("Location")!;

    // But the actual R2 download should return an error (file deleted)
    const fileRes = await fetch(downloadUrl);
    expect(fileRes.ok).toBe(false);
  }, 30_000);
});

// ════════════════════════════════════════════════════════════════════
// 9. PROJECT-SCOPED COLLABORATION
// ════════════════════════════════════════════════════════════════════
//
// Real-life scenario: A Squad Lead creates a project, adds team members,
// creates project-scoped tasks. Non-members cannot access project tasks.
// Members are added and removed dynamically.

describe("9. Project-Scoped Collaboration", () => {
  // Create Kia (Squad Lead) and Sage (non-member) for project tests
  it("creates Kia — Squad Lead", async () => {
    const req = buildRequest("POST", "/api/agents/create", {
      body: { name: "Kia", role: "Squad Lead", username: "kia" },
    });
    const res = await callRoute(createAgent, req);
    expect(res.status).toBe(201);
    const data = await res.json();
    kiaApiKey = data.apiKey;
    kiaAgentId = data.agent.id;

    await prisma.agent.update({
      where: { id: kiaAgentId },
      data: { setupStatus: SetupStatus.ACTIVE },
    });
    agentCache.clear();
  });

  it("creates Sage — Social Media (will be non-member)", async () => {
    const req = buildRequest("POST", "/api/agents/create", {
      body: { name: "Sage", role: "Social Media Manager", username: "sage" },
    });
    const res = await callRoute(createAgent, req);
    expect(res.status).toBe(201);
    const data = await res.json();
    sageApiKey = data.apiKey;
    sageAgentId = data.agent.id;

    await prisma.agent.update({
      where: { id: sageAgentId },
      data: { setupStatus: SetupStatus.ACTIVE },
    });
    agentCache.clear();
  });

  it("Kia creates project 'Website Redesign' with Rex and Nova", async () => {
    const req = buildRequest("POST", "/api/projects", {
      apiKey: kiaApiKey,
      body: {
        name: "Website Redesign",
        description: "Full redesign of the company website",
        memberIds: [rexAgentId, novaAgentId],
      },
    });
    const res = await callRoute(createProject, req);
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.name).toBe("Website Redesign");
    expect(data.members).toHaveLength(3); // Kia + Rex + Nova
    projectId = data.id;
    memberCache.clear();
    projectIdsCache.clear();
  });

  it("project appears in Kia's project list", async () => {
    const req = buildRequest("GET", "/api/projects", { apiKey: kiaApiKey });
    const res = await callRoute(listProjects, req);
    const data = await res.json();
    expect(data.some((p: any) => p.id === projectId)).toBe(true);
  });

  it("Rex sees the project too (as member)", async () => {
    const req = buildRequest("GET", "/api/projects", { apiKey: rexApiKey });
    const res = await callRoute(listProjects, req);
    const data = await res.json();
    expect(data.some((p: any) => p.id === projectId)).toBe(true);
  });

  it("non-lead Rex cannot create projects — 403", async () => {
    const req = buildRequest("POST", "/api/projects", {
      apiKey: rexApiKey,
      body: { name: "Rex's Secret Project" },
    });
    const res = await callRoute(createProject, req);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/squad lead/i);
  });

  it("rejects project without name — 400", async () => {
    const req = buildRequest("POST", "/api/projects", {
      apiKey: kiaApiKey,
      body: { description: "No name" },
    });
    const res = await callRoute(createProject, req);
    expect(res.status).toBe(400);
  });

  it("Rex sees the project in his list", async () => {
    const req = buildRequest("GET", "/api/projects", { apiKey: rexApiKey });
    const res = await callRoute(listProjects, req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.some((p: any) => p.id === projectId)).toBe(true);
  });

  it("Sage does NOT see the project (not a member)", async () => {
    const req = buildRequest("GET", "/api/projects", { apiKey: sageApiKey });
    const res = await callRoute(listProjects, req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.some((p: any) => p.id === projectId)).toBe(false);
  });

  it("Kia creates a task scoped to the project", async () => {
    const req = buildRequest("POST", "/api/tasks", {
      apiKey: kiaApiKey,
      body: {
        title: "Redesign homepage hero section",
        description: "New hero with gradient, CTA, and responsive layout",
        projectId,
        assigneeIds: [rexAgentId],
      },
    });
    const res = await callRoute(createTaskHandler, req);
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.projectId).toBe(projectId);
    expect(data.assignees).toHaveLength(1);
    expect(data.assignees[0].profileId).toBe(rexProfileId);
    projectTaskId = data.id;
  });

  it("Rex (member) can see the project task", async () => {
    memberCache.clear();
    projectIdsCache.clear();
    const req = buildRequest("GET", `/api/tasks/${projectTaskId}`, { apiKey: rexApiKey });
    const res = await callRoute(getTask, req, { id: projectTaskId });
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe("Redesign homepage hero section");
  });

  it("Sage (non-member) cannot see the project task — 403", async () => {
    memberCache.clear();
    const req = buildRequest("GET", `/api/tasks/${projectTaskId}`, { apiKey: sageApiKey });
    const res = await callRoute(getTask, req, { id: projectTaskId });
    expect(res.status).toBe(403);
  });

  it("Kia adds Sage to the project", async () => {
    const req = buildRequest("POST", `/api/projects/${projectId}/members`, {
      apiKey: kiaApiKey,
      body: { agentId: sageAgentId },
    });
    const res = await callRoute(addMember, req, { id: projectId });
    expect(res.status).toBe(201);
    memberCache.clear();
    projectIdsCache.clear();
  });

  it("Sage can now see the project task", async () => {
    const req = buildRequest("GET", `/api/tasks/${projectTaskId}`, { apiKey: sageApiKey });
    const res = await callRoute(getTask, req, { id: projectTaskId });
    expect(res.status).toBe(200);
  });

  it("Kia removes Sage from the project", async () => {
    const req = buildRequest("DELETE", `/api/projects/${projectId}/members`, {
      apiKey: kiaApiKey,
      body: { agentId: sageAgentId },
    });
    const res = await callRoute(removeMember, req, { id: projectId });
    expect(res.status).toBe(200);
    expect((await res.json()).removed).toBe(true);
    memberCache.clear();
    projectIdsCache.clear();
  });

  it("Sage can no longer see the project task — 403", async () => {
    const req = buildRequest("GET", `/api/tasks/${projectTaskId}`, { apiKey: sageApiKey });
    const res = await callRoute(getTask, req, { id: projectTaskId });
    expect(res.status).toBe(403);
  });

  it("cannot remove a Squad Lead from a project — 403", async () => {
    const req = buildRequest("DELETE", `/api/projects/${projectId}/members`, {
      apiKey: kiaApiKey,
      body: { agentId: kiaAgentId },
    });
    const res = await callRoute(removeMember, req, { id: projectId });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/squad lead/i);
  });

  it("non-lead Rex cannot add members — 403", async () => {
    const req = buildRequest("POST", `/api/projects/${projectId}/members`, {
      apiKey: rexApiKey,
      body: { agentId: sageAgentId },
    });
    const res = await callRoute(addMember, req, { id: projectId });
    expect(res.status).toBe(403);
  });
});

// ════════════════════════════════════════════════════════════════════
// 10. TASK REVIEW CYCLE
// ════════════════════════════════════════════════════════════════════
//
// Real-life scenario: Rex works on the project task, submits for review.
// Kia (Squad Lead) requests clarification, then rejects with changes,
// Rex revises, and Kia finally approves — spawning follow-up tasks.

describe("10. Task Review Cycle", () => {
  it("Rex moves task to in_progress", async () => {
    const req = buildRequest("PATCH", `/api/tasks/${projectTaskId}`, {
      apiKey: rexApiKey,
      body: { status: "in_progress" },
    });
    const res = await callRoute(updateTask, req, { id: projectTaskId });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("in_progress");
  });

  it("Rex submits a deliverable and moves to review", async () => {
    // Submit deliverable
    const delivReq = buildRequest("POST", `/api/tasks/${projectTaskId}/deliverables`, {
      apiKey: rexApiKey,
      body: {
        title: "Hero Component v1",
        kind: "code",
        content: "export function Hero() { return <section>Draft hero</section>; }",
        language: "tsx",
      },
    });
    const delivRes = await callRoute(createDeliverable, delivReq, { id: projectTaskId });
    expect(delivRes.status).toBe(201);

    // Move to review
    const statusReq = buildRequest("PATCH", `/api/tasks/${projectTaskId}`, {
      apiKey: rexApiKey,
      body: { status: "review" },
    });
    const statusRes = await callRoute(updateTask, statusReq, { id: projectTaskId });
    expect(statusRes.status).toBe(200);
    expect((await statusRes.json()).status).toBe("review");
  });

  it("status change to review logged in activity feed", async () => {
    const activity = await prisma.activity.findFirst({
      where: { taskId: projectTaskId, type: "task_updated" },
      orderBy: { createdAt: "desc" },
    });
    expect(activity).toBeDefined();
    expect(activity!.message).toContain("in_progress");
    expect(activity!.message).toContain("review");
  });

  it("subscribers notified of status change to review", async () => {
    subscriberCache.clear();
    // Kia (creator) is subscribed; Rex (changedBy) is excluded from notifications
    const req = buildRequest("GET", "/api/notifications", { apiKey: kiaApiKey });
    const res = await callRoute(listNotifications, req);
    const data = await res.json();
    const statusNotif = data.find((n: any) => n.content?.includes("moved to review"));
    expect(statusNotif).toBeDefined();
  });

  it("Rex posts 'ready for review' message", async () => {
    const req = buildRequest("POST", `/api/tasks/${projectTaskId}/messages`, {
      apiKey: rexApiKey,
      body: { content: "Hero component is ready for review @kia" },
    });
    const res = await callRoute(createMessage, req, { id: projectTaskId });
    expect(res.status).toBe(201);
    reviewMessageId = (await res.json()).id;
  });

  it("non-lead Rex cannot approve — 403", async () => {
    const req = buildRequest("POST", `/api/tasks/${projectTaskId}/approve`, {
      apiKey: rexApiKey,
      body: {},
    });
    const res = await callRoute(approveTask, req, { id: projectTaskId });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/squad lead/i);
  });

  it("non-lead Rex cannot reject — 403", async () => {
    const req = buildRequest("POST", `/api/tasks/${projectTaskId}/reject`, {
      apiKey: rexApiKey,
      body: { rejectionReason: "I reject myself", changesNeeded: ["test"] },
    });
    const res = await callRoute(rejectTask, req, { id: projectTaskId });
    expect(res.status).toBe(403);
  });

  it("Kia requests clarification — auto-posts message", async () => {
    const req = buildRequest("POST", `/api/tasks/${projectTaskId}/request-clarification`, {
      apiKey: kiaApiKey,
      body: {
        questions: ["Does the hero support dark mode?", "What's the mobile breakpoint strategy?"],
      },
    });
    const res = await callRoute(requestClarification, req, { id: projectTaskId });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    // Verify clarification message was auto-posted
    const msgReq = buildRequest("GET", `/api/tasks/${projectTaskId}/messages`, {
      apiKey: kiaApiKey,
    });
    const msgRes = await callRoute(listMessages, msgReq, { id: projectTaskId });
    const messages = await msgRes.json();
    const clarification = messages.find((m: any) => m.content.includes("Clarification needed"));
    expect(clarification).toBeDefined();
    expect(clarification.content).toContain("dark mode");
    expect(clarification.content).toContain("mobile breakpoint");
  });

  it("clarification logged in activity feed", async () => {
    const activity = await prisma.activity.findFirst({
      where: {
        taskId: projectTaskId,
        type: "task_updated",
        message: { contains: "Clarification requested" },
      },
    });
    expect(activity).toBeDefined();
    expect(activity!.metadata).toMatchObject({ eventType: "task.clarification_requested" });
  });

  it("Rex notified of clarification request", async () => {
    subscriberCache.clear();
    const req = buildRequest("GET", "/api/notifications", { apiKey: rexApiKey });
    const res = await callRoute(listNotifications, req);
    const data = await res.json();
    const clarNotif = data.find((n: any) => n.content?.includes("requested clarification"));
    expect(clarNotif).toBeDefined();
  });

  it("rejects clarification without questions — 400", async () => {
    const req = buildRequest("POST", `/api/tasks/${projectTaskId}/request-clarification`, {
      apiKey: kiaApiKey,
      body: {},
    });
    const res = await callRoute(requestClarification, req, { id: projectTaskId });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/questions/i);
  });

  it("Kia rejects task — moves back to assigned with feedback", async () => {
    const req = buildRequest("POST", `/api/tasks/${projectTaskId}/reject`, {
      apiKey: kiaApiKey,
      body: {
        rejectionReason: "Hero section needs more polish",
        changesNeeded: [
          "Add gradient background per design spec",
          "Include CTA button with hover animation",
          "Add responsive breakpoints for mobile/tablet",
        ],
      },
    });
    const res = await callRoute(rejectTask, req, { id: projectTaskId });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.newStatus).toBe("assigned");

    // Verify rejection message was posted
    const msgReq = buildRequest("GET", `/api/tasks/${projectTaskId}/messages`, {
      apiKey: kiaApiKey,
    });
    const msgRes = await callRoute(listMessages, msgReq, { id: projectTaskId });
    const messages = await msgRes.json();
    const rejection = messages.find((m: any) => m.content.includes("Task rejected"));
    expect(rejection).toBeDefined();
    expect(rejection.content).toContain("gradient background");
    expect(rejection.content).toContain("CTA button");
  });

  it("rejection logged in activity feed", async () => {
    const activity = await prisma.activity.findFirst({
      where: {
        taskId: projectTaskId,
        type: "task_updated",
        message: { contains: "rejected by Kia" },
      },
    });
    expect(activity).toBeDefined();
    expect(activity!.metadata).toMatchObject({ eventType: "task.rejected" });
  });

  it("Rex notified of rejection with reason", async () => {
    subscriberCache.clear();
    const req = buildRequest("GET", "/api/notifications", { apiKey: rexApiKey });
    const res = await callRoute(listNotifications, req);
    const data = await res.json();
    const rejectNotif = data.find((n: any) => n.content?.includes("was rejected by Kia"));
    expect(rejectNotif).toBeDefined();
  });

  it("rejection auto-created high-priority queue item", async () => {
    const req = buildRequest("GET", "/api/queue", { apiKey: rexApiKey });
    const res = await callRoute(listQueue, req);
    const data = await res.json();
    const rejectionItem = data.find((i: any) => i.generatedFrom === "review_rejection");
    expect(rejectionItem).toBeDefined();
    expect(rejectionItem.priority).toBe("high");
    expect(rejectionItem.title).toContain("Address review feedback");
  });

  it("rejects rejection without reason — 400", async () => {
    const req = buildRequest("POST", `/api/tasks/${projectTaskId}/reject`, {
      apiKey: kiaApiKey,
      body: { changesNeeded: ["something"] },
    });
    const res = await callRoute(rejectTask, req, { id: projectTaskId });
    expect(res.status).toBe(400);
  });

  it("Rex revises and resubmits for review", async () => {
    // Move back to in_progress
    await callRoute(
      updateTask,
      buildRequest("PATCH", `/api/tasks/${projectTaskId}`, {
        apiKey: rexApiKey,
        body: { status: "in_progress" },
      }),
      { id: projectTaskId },
    );

    // Submit revised deliverable
    await callRoute(
      createDeliverable,
      buildRequest("POST", `/api/tasks/${projectTaskId}/deliverables`, {
        apiKey: rexApiKey,
        body: {
          title: "Hero Component v2 — with gradient, CTA, responsive",
          kind: "code",
          content: `export function Hero() {
  return (
    <section className="hero bg-gradient-to-r from-indigo-500 to-purple-600">
      <h1>Welcome</h1>
      <button className="cta hover:scale-105 transition-transform">Get Started</button>
    </section>
  );
}`,
          language: "tsx",
        },
      }),
      { id: projectTaskId },
    );

    // Move to review
    const res = await callRoute(
      updateTask,
      buildRequest("PATCH", `/api/tasks/${projectTaskId}`, {
        apiKey: rexApiKey,
        body: { status: "review" },
      }),
      { id: projectTaskId },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("review");
  });

  it("Kia approves — task moves to done, spawns follow-up tasks", async () => {
    const req = buildRequest("POST", `/api/tasks/${projectTaskId}/approve`, {
      apiKey: kiaApiKey,
      body: {
        approvalComment: "Looks great! Shipping it.",
        childTasks: [
          {
            title: "Add hero section A/B test",
            description: "Test gradient vs solid background conversion rates",
            assigneeIds: [rexAgentId],
          },
          {
            title: "Write hero section copy",
            description: "Draft headline and subheadline for hero CTA",
            assigneeIds: [novaAgentId],
          },
        ],
      },
    });
    const res = await callRoute(approveTask, req, { id: projectTaskId });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.newStatus).toBe(TaskStatus.DONE);
    expect(data.childTaskIds).toHaveLength(2);

    // Verify task is actually done
    const taskReq = buildRequest("GET", `/api/tasks/${projectTaskId}`, { apiKey: kiaApiKey });
    const taskRes = await callRoute(getTask, taskReq, { id: projectTaskId });
    expect((await taskRes.json()).status).toBe(TaskStatus.DONE);

    // Verify child tasks were created
    for (const childId of data.childTaskIds) {
      const childReq = buildRequest("GET", `/api/tasks/${childId}`, { apiKey: kiaApiKey });
      const childRes = await callRoute(getTask, childReq, { id: childId });
      const child = await childRes.json();
      expect(child.status).toBe("inbox");
      expect(child.description).toContain("Spawned from");
    }
  });

  it("approval logged in activity feed", async () => {
    const activity = await prisma.activity.findFirst({
      where: {
        taskId: projectTaskId,
        type: "task_completed",
        message: { contains: "approved by Kia" },
      },
    });
    expect(activity).toBeDefined();
    expect(activity!.metadata).toMatchObject({ eventType: "task.approved" });
  });

  it("Rex notified of approval", async () => {
    subscriberCache.clear();
    const req = buildRequest("GET", "/api/notifications", { apiKey: rexApiKey });
    const res = await callRoute(listNotifications, req);
    const data = await res.json();
    const approveNotif = data.find((n: any) => n.content?.includes("was approved by Kia"));
    expect(approveNotif).toBeDefined();
  });

  it("review queue items auto-completed on approval", async () => {
    const req = buildRequest("GET", "/api/queue", { apiKey: rexApiKey });
    const res = await callRoute(listQueue, req);
    const data = await res.json();
    const rejectionItem = data.find((i: any) => i.generatedFrom === "review_rejection");
    expect(rejectionItem).toBeDefined();
    expect(rejectionItem.status).toBe(QueueItemStatus.COMPLETED);
  });

  it("approving nonexistent task — 404", async () => {
    const req = buildRequest("POST", "/api/tasks/nonexistent/approve", {
      apiKey: kiaApiKey,
      body: {},
    });
    const res = await callRoute(approveTask, req, { id: "nonexistent" });
    expect(res.status).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════════════
// 11. MESSAGE REACTIONS
// ════════════════════════════════════════════════════════════════════
//
// Real-life scenario: Agents react to messages with emoji.
// Toggle on/off, invalid emoji rejected, nonexistent message 404.

describe("11. Message Reactions", () => {
  it("Nova reacts to Rex's review message with thumbs-up", async () => {
    const req = buildRequest("POST", `/api/messages/${reviewMessageId}/reactions`, {
      apiKey: novaApiKey,
      body: { emoji: "thumbs-up" },
    });
    const res = await callRoute(reactToMessage, req, { id: reviewMessageId });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.emoji).toBe("thumbs-up");
    expect(data.action).toBe("added");
  });

  it("Kia reacts with heart", async () => {
    const req = buildRequest("POST", `/api/messages/${reviewMessageId}/reactions`, {
      apiKey: kiaApiKey,
      body: { emoji: "heart" },
    });
    const res = await callRoute(reactToMessage, req, { id: reviewMessageId });
    expect(res.status).toBe(200);
    expect((await res.json()).action).toBe("added");
  });

  it("Rex reacts with checkmark", async () => {
    const req = buildRequest("POST", `/api/messages/${reviewMessageId}/reactions`, {
      apiKey: rexApiKey,
      body: { emoji: "checkmark" },
    });
    const res = await callRoute(reactToMessage, req, { id: reviewMessageId });
    expect(res.status).toBe(200);
    expect((await res.json()).action).toBe("added");
  });

  it("Nova toggles thumbs-up OFF (second click removes it)", async () => {
    const req = buildRequest("POST", `/api/messages/${reviewMessageId}/reactions`, {
      apiKey: novaApiKey,
      body: { emoji: "thumbs-up" },
    });
    const res = await callRoute(reactToMessage, req, { id: reviewMessageId });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.action).toBe("removed");
  });

  it("Nova can re-add the same emoji", async () => {
    const req = buildRequest("POST", `/api/messages/${reviewMessageId}/reactions`, {
      apiKey: novaApiKey,
      body: { emoji: "thumbs-up" },
    });
    const res = await callRoute(reactToMessage, req, { id: reviewMessageId });
    expect((await res.json()).action).toBe("added");
  });

  it("rejects invalid emoji — 400", async () => {
    const req = buildRequest("POST", `/api/messages/${reviewMessageId}/reactions`, {
      apiKey: rexApiKey,
      body: { emoji: "poop" },
    });
    const res = await callRoute(reactToMessage, req, { id: reviewMessageId });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("emoji");
  });

  it("rejects reaction without emoji — 400", async () => {
    const req = buildRequest("POST", `/api/messages/${reviewMessageId}/reactions`, {
      apiKey: rexApiKey,
      body: {},
    });
    const res = await callRoute(reactToMessage, req, { id: reviewMessageId });
    expect(res.status).toBe(400);
  });

  it("reacting to nonexistent message — 404", async () => {
    const req = buildRequest("POST", "/api/messages/nonexistent/reactions", {
      apiKey: rexApiKey,
      body: { emoji: "heart" },
    });
    const res = await callRoute(reactToMessage, req, { id: "nonexistent" });
    expect(res.status).toBe(404);
  });

  it("reactions persisted in database", async () => {
    const reactions = await prisma.messageReaction.findMany({
      where: { messageId: reviewMessageId },
    });
    // Nova: thumbs-up, Kia: heart, Rex: checkmark = 3
    expect(reactions).toHaveLength(3);
    const emojis = reactions.map((r) => r.emoji).sort();
    expect(emojis).toEqual(["checkmark", "heart", "thumbs-up"]);
  });
});

// ════════════════════════════════════════════════════════════════════
// 12. NOTIFICATIONS
// ════════════════════════════════════════════════════════════════════
//
// Real-life scenario: Rex @mentions Nova, task assignment triggers
// notifications. Nova checks unread, marks as delivered, verifies
// they don't appear again. Agent can only mark their own notifications.

describe("12. Notifications", () => {
  it("Rex @mentions Nova in a new message — triggers notification", async () => {
    const req = buildRequest("POST", `/api/tasks/${projectTaskId}/messages`, {
      apiKey: rexApiKey,
      body: { content: "Hey @nova check out the revised hero component" },
    });
    const res = await callRoute(createMessage, req, { id: projectTaskId });
    expect(res.status).toBe(201);
  });

  it("Nova has unread notifications", async () => {
    const req = buildRequest("GET", "/api/notifications", { apiKey: novaApiKey });
    const res = await callRoute(listNotifications, req);
    expect(res.status).toBe(200);

    const data = await res.json();
    // Should have notifications from various events (mentions, assignments, approval)
    expect(data.length).toBeGreaterThan(0);

    // All should be undelivered
    expect(data.every((n: any) => n.delivered === false)).toBe(true);

    // At least one should be the @mention notification
    const mentionNotif = data.find((n: any) => n.content?.includes("mentioned you"));
    expect(mentionNotif).toBeDefined();
  });

  it("Nova marks a notification as delivered", async () => {
    // Get Nova's notifications first
    const listReq = buildRequest("GET", "/api/notifications", { apiKey: novaApiKey });
    const listRes = await callRoute(listNotifications, listReq);
    const notifications = await listRes.json();
    const firstNotifId = notifications[0].id;

    const req = buildRequest("POST", "/api/notifications/mark-delivered", {
      apiKey: novaApiKey,
      body: { id: firstNotifId },
    });
    const res = await callRoute(markDelivered, req);
    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(1);
  });

  it("delivered notification has timestamp", async () => {
    const notification = await prisma.notification.findFirst({
      where: { mentionedAgentId: novaAgentId, delivered: true },
    });
    expect(notification).toBeDefined();
    expect(notification!.deliveredAt).toBeTruthy();
  });

  it("notification has correct task context", async () => {
    const notification = await prisma.notification.findFirst({
      where: {
        mentionedAgentId: novaAgentId,
        content: { contains: "mentioned you" },
        taskId: projectTaskId,
      },
    });
    expect(notification).toBeDefined();
    expect(notification!.taskId).toBe(projectTaskId);
  });

  it("delivered notification hidden from default list", async () => {
    const req = buildRequest("GET", "/api/notifications", { apiKey: novaApiKey });
    const res = await callRoute(listNotifications, req);
    const data = await res.json();

    // All returned notifications should be undelivered
    expect(data.every((n: any) => n.delivered === false)).toBe(true);
  });

  it("delivered notification visible with includeDelivered=true", async () => {
    const req = buildRequest("GET", "/api/notifications?includeDelivered=true", {
      apiKey: novaApiKey,
    });
    const res = await callRoute(listNotifications, req);
    const data = await res.json();

    // Should include both delivered and undelivered
    const delivered = data.filter((n: any) => n.delivered === true);
    expect(delivered.length).toBeGreaterThan(0);
  });

  it("Nova marks all remaining notifications as delivered (batch)", async () => {
    const listReq = buildRequest("GET", "/api/notifications", { apiKey: novaApiKey });
    const listRes = await callRoute(listNotifications, listReq);
    const unread = await listRes.json();
    const ids = unread.map((n: any) => n.id);

    if (ids.length > 0) {
      const req = buildRequest("POST", "/api/notifications/mark-delivered", {
        apiKey: novaApiKey,
        body: { ids },
      });
      const res = await callRoute(markDelivered, req);
      expect(res.status).toBe(200);
      expect((await res.json()).count).toBe(ids.length);
    }

    // Verify inbox is now empty
    const emptyReq = buildRequest("GET", "/api/notifications", { apiKey: novaApiKey });
    const emptyRes = await callRoute(listNotifications, emptyReq);
    expect(await emptyRes.json()).toHaveLength(0);
  });

  it("rejects mark-delivered without id — 400", async () => {
    const req = buildRequest("POST", "/api/notifications/mark-delivered", {
      apiKey: novaApiKey,
      body: {},
    });
    const res = await callRoute(markDelivered, req);
    expect(res.status).toBe(400);
  });

  it("Rex cannot mark Nova's notifications (only own)", async () => {
    // Create a new notification for Nova
    await callRoute(
      createMessage,
      buildRequest("POST", `/api/tasks/${projectTaskId}/messages`, {
        apiKey: rexApiKey,
        body: { content: "Another ping @nova" },
      }),
      { id: projectTaskId },
    );

    // Get Nova's notification
    const listReq = buildRequest("GET", "/api/notifications", { apiKey: novaApiKey });
    const novaNotifs = await (await callRoute(listNotifications, listReq)).json();
    const novaNotifId = novaNotifs[0]?.id;

    if (novaNotifId) {
      // Rex tries to mark it
      const req = buildRequest("POST", "/api/notifications/mark-delivered", {
        apiKey: rexApiKey,
        body: { id: novaNotifId },
      });
      const res = await callRoute(markDelivered, req);
      expect(res.status).toBe(200);
      // Count should be 0 — Rex doesn't own that notification
      expect((await res.json()).count).toBe(0);
    }
  });

  it("Nova's notification still undelivered after Rex's failed attempt", async () => {
    const req = buildRequest("GET", "/api/notifications", { apiKey: novaApiKey });
    const res = await callRoute(listNotifications, req);
    const data = await res.json();
    // Nova should still have at least one undelivered notification (the "Another ping @nova")
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((n: any) => n.delivered === false)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════
// 13. AGENT QUEUE (Personal Work Management)
// ════════════════════════════════════════════════════════════════════
//
// Real-life scenario: Rex manages his personal work queue — creates
// items, moves through the lifecycle, links to tasks, appends notes.
// Nova cannot touch Rex's queue items.

describe("13. Agent Queue", () => {
  let queueItemId: string;
  let secondItemId: string;

  it("task rejection auto-created a queue item (completed by later approval)", async () => {
    agentCache.clear();
    // The task.rejected event in section 10 auto-creates a queue item for Rex.
    // The task.approved event later completes it. Verify the completed item exists.
    const req = buildRequest("GET", "/api/queue", { apiKey: rexApiKey });
    const res = await callRoute(listQueue, req);
    expect(res.status).toBe(200);

    const data = await res.json();
    const autoItem = data.find((i: any) => i.generatedFrom === "review_rejection");
    expect(autoItem).toBeDefined();
    expect(autoItem.title).toContain("Address review feedback");
    expect(autoItem.priority).toBe("high");
    expect(autoItem.status).toBe(QueueItemStatus.COMPLETED); // approved event completed it

    // Clean up so we can test fresh queue creation with order=1
    await prisma.agentQueueItem.deleteMany({ where: { agentId: rexAgentId } });
  });

  it("Rex creates a queue item linked to the project task", async () => {
    const req = buildRequest("POST", "/api/queue", {
      apiKey: rexApiKey,
      body: {
        title: "Implement hero gradient animation",
        description: "Add CSS keyframe animation to the gradient background",
        relatedTaskId: projectTaskId,
        priority: "high",
        itemType: "action",
      },
    });
    const res = await callRoute(createQueueItem, req);
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.title).toBe("Implement hero gradient animation");
    expect(data.priority).toBe("high");
    expect(data.status).toBe(QueueItemStatus.PENDING);
    expect(data.order).toBe(1);
    expect(data.relatedTaskId).toBe(projectTaskId);
    queueItemId = data.id;
  });

  it("Rex creates a second queue item (order auto-increments)", async () => {
    const req = buildRequest("POST", "/api/queue", {
      apiKey: rexApiKey,
      body: {
        title: "Research animation libraries",
        itemType: "research",
      },
    });
    const res = await callRoute(createQueueItem, req);
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.order).toBe(2); // auto-incremented
    expect(data.priority).toBe("medium"); // default
    secondItemId = data.id;
  });

  it("rejects queue item without title — 400", async () => {
    const req = buildRequest("POST", "/api/queue", {
      apiKey: rexApiKey,
      body: { description: "No title" },
    });
    const res = await callRoute(createQueueItem, req);
    expect(res.status).toBe(400);
  });

  it("Rex lists his active queue items", async () => {
    const req = buildRequest("GET", "/api/queue?active=true", { apiKey: rexApiKey });
    const res = await callRoute(listQueue, req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveLength(2);
    // Ordered by order field
    expect(data[0].order).toBeLessThan(data[1].order);
  });

  it("Rex moves first item to in_progress — startedAt set", async () => {
    const req = buildRequest("PATCH", `/api/queue/${queueItemId}`, {
      apiKey: rexApiKey,
      body: { status: "in_progress" },
    });
    const res = await callRoute(updateQueueItem, req, { id: queueItemId });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("in_progress");
    expect(data.startedAt).toBeTruthy();
  });

  it("Rex appends notes to the queue item", async () => {
    const req = buildRequest("PATCH", `/api/queue/${queueItemId}`, {
      apiKey: rexApiKey,
      body: { notes: "Tried framer-motion, works great with Tailwind" },
    });
    const res = await callRoute(updateQueueItem, req, { id: queueItemId });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.notes).toContain("framer-motion");
  });

  it("Rex completes the queue item — completedAt set", async () => {
    const req = buildRequest("PATCH", `/api/queue/${queueItemId}`, {
      apiKey: rexApiKey,
      body: { status: QueueItemStatus.COMPLETED },
    });
    const res = await callRoute(updateQueueItem, req, { id: queueItemId });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe(QueueItemStatus.COMPLETED);
    expect(data.completedAt).toBeTruthy();
  });

  it("completed items excluded from active list", async () => {
    const req = buildRequest("GET", "/api/queue?active=true", { apiKey: rexApiKey });
    const res = await callRoute(listQueue, req);
    const data = await res.json();

    // Only the second item (pending) should remain
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(secondItemId);
  });

  it("Nova cannot update Rex's queue item — 403", async () => {
    const req = buildRequest("PATCH", `/api/queue/${secondItemId}`, {
      apiKey: novaApiKey,
      body: { title: "Hijacked" },
    });
    const res = await callRoute(updateQueueItem, req, { id: secondItemId });
    expect(res.status).toBe(403);
  });

  it("Nova cannot delete Rex's queue item — 403", async () => {
    const req = buildRequest("DELETE", `/api/queue/${secondItemId}`, { apiKey: novaApiKey });
    const res = await callRoute(deleteQueueItem, req, { id: secondItemId });
    expect(res.status).toBe(403);
  });

  it("updating nonexistent queue item — 404", async () => {
    const req = buildRequest("PATCH", "/api/queue/nonexistent", {
      apiKey: rexApiKey,
      body: { title: "Ghost" },
    });
    const res = await callRoute(updateQueueItem, req, { id: "nonexistent" });
    expect(res.status).toBe(404);
  });

  it("Rex deletes the second queue item", async () => {
    const req = buildRequest("DELETE", `/api/queue/${secondItemId}`, { apiKey: rexApiKey });
    const res = await callRoute(deleteQueueItem, req, { id: secondItemId });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════
// 14. KANBAN BOARD
// ════════════════════════════════════════════════════════════════════
//
// Real-life scenario: The dashboard kanban board groups tasks by status.
// Squad Lead sees all tasks, workers see only their assigned tasks.

describe("14. Kanban Board", () => {
  it("Kia (Squad Lead) sees all statuses on the board", async () => {
    projectIdsCache.clear();
    memberCache.clear();
    const req = buildRequest("GET", "/api/tasks/board", { apiKey: kiaApiKey });
    const res = await callRoute(getBoard, req);
    expect(res.status).toBe(200);

    const board = await res.json();
    // Board should have all 6 status columns
    expect(Object.keys(board)).toEqual(expect.arrayContaining(Object.values(TaskStatus)));

    // The approved project task should be in "done"
    const doneTasks = board.done;
    expect(doneTasks.some((t: any) => t.id === projectTaskId)).toBe(true);
  });

  it("Rex sees only tasks assigned to him on the board", async () => {
    const req = buildRequest("GET", "/api/tasks/board", { apiKey: rexApiKey });
    const res = await callRoute(getBoard, req);
    expect(res.status).toBe(200);

    const board = await res.json();
    // All tasks across all columns should be assigned to Rex
    for (const [_status, tasks] of Object.entries(board) as [string, any[]][]) {
      for (const task of tasks) {
        if (task.projectId === projectId) {
          const assigneeProfileIds = task.assignees.map((a: any) => a.profileId);
          expect(assigneeProfileIds).toContain(rexProfileId);
        }
      }
    }
  });

  it("board can be filtered by project", async () => {
    const req = buildRequest("GET", `/api/tasks/board?projectId=${projectId}`, {
      apiKey: kiaApiKey,
    });
    const res = await callRoute(getBoard, req);
    expect(res.status).toBe(200);

    const board = await res.json();
    // Every task should belong to the project
    for (const tasks of Object.values(board) as any[][]) {
      for (const task of tasks) {
        expect(task.projectId).toBe(projectId);
      }
    }
  });

  it("board without auth — 401", async () => {
    const req = buildRequest("GET", "/api/tasks/board");
    const res = await callRoute(getBoard, req);
    expect(res.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════════════
// 14½. LEAD BATCH TASK CREATION — PRIORITIES, ASSIGNMENT & CASCADES
// ════════════════════════════════════════════════════════════════════
//
// Complex real-life scenario: Kia (Squad Lead) creates 4 project-scoped
// tasks with mixed priorities (1 high, 2 medium, 1 low), assigns the
// high-priority task to Rex, then we verify every cascading side effect:
// task lists, activity feed, subscriptions, notifications, and board state.

describe("14½. Lead Batch Task Creation — Priorities & Side Effects", () => {
  const batchTaskIds: string[] = [];
  let highPriorityTaskId: string;
  let activityCountBefore: number;

  it("snapshot activity count before batch creation", async () => {
    activityCountBefore = await prisma.activity.count({
      where: { projectId },
    });
  });

  // ── Step 1: Kia creates 4 tasks with different priorities ──────

  it("Kia creates high-priority task — 'Redesign navigation bar'", async () => {
    subscriberCache.clear();
    const req = buildRequest("POST", "/api/tasks", {
      apiKey: kiaApiKey,
      body: {
        title: "Redesign navigation bar",
        description:
          "Full responsive nav with mobile hamburger menu, search bar, and mega-menu for products",
        projectId,
        priority: "high",
      },
    });
    const res = await callRoute(createTaskHandler, req);
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.priority).toBe("high");
    expect(data.projectId).toBe(projectId);
    expect(data.status).toBe("inbox");
    highPriorityTaskId = data.id;
    batchTaskIds.push(data.id);
  });

  it("Kia creates first medium-priority task — 'Update footer links'", async () => {
    const req = buildRequest("POST", "/api/tasks", {
      apiKey: kiaApiKey,
      body: {
        title: "Update footer links",
        description: "Add legal pages, social media icons, and newsletter signup to the footer",
        projectId,
        priority: "medium",
      },
    });
    const res = await callRoute(createTaskHandler, req);
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.priority).toBe("medium");
    batchTaskIds.push(data.id);
  });

  it("Kia creates second medium-priority task — 'Write accessibility guidelines'", async () => {
    const req = buildRequest("POST", "/api/tasks", {
      apiKey: kiaApiKey,
      body: {
        title: "Write accessibility guidelines",
        description:
          "Document WCAG 2.1 AA compliance requirements, color contrast ratios, and screen reader testing procedures",
        projectId,
        priority: "medium",
      },
    });
    const res = await callRoute(createTaskHandler, req);
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.priority).toBe("medium");
    batchTaskIds.push(data.id);
  });

  it("Kia creates low-priority task — 'Fix favicon'", async () => {
    const req = buildRequest("POST", "/api/tasks", {
      apiKey: kiaApiKey,
      body: {
        title: "Fix favicon",
        description:
          "Replace placeholder favicon with the new brand icon in all sizes (16x16, 32x32, 180x180)",
        projectId,
        priority: "low",
      },
    });
    const res = await callRoute(createTaskHandler, req);
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.priority).toBe("low");
    batchTaskIds.push(data.id);
  });

  // ── Step 2: Verify all 4 tasks in task list with correct metadata ──

  it("all 4 tasks appear in Kia's task list with correct priorities", async () => {
    const req = buildRequest("GET", `/api/tasks?projectId=${projectId}`, { apiKey: kiaApiKey });
    const res = await callRoute(listTasks, req);
    expect(res.status).toBe(200);

    const data = await res.json();
    for (const id of batchTaskIds) {
      expect(data.some((t: any) => t.id === id)).toBe(true);
    }

    // Verify priorities
    const highTask = data.find((t: any) => t.id === highPriorityTaskId);
    expect(highTask.priority).toBe("high");
    expect(highTask.title).toBe("Redesign navigation bar");

    const mediumTasks = data.filter(
      (t: any) => batchTaskIds.includes(t.id) && t.priority === "medium",
    );
    expect(mediumTasks).toHaveLength(2);

    const lowTasks = data.filter((t: any) => batchTaskIds.includes(t.id) && t.priority === "low");
    expect(lowTasks).toHaveLength(1);
    expect(lowTasks[0].title).toBe("Fix favicon");
  });

  it("Rex (project member) also sees all 4 batch tasks", async () => {
    memberCache.clear();
    projectIdsCache.clear();
    const req = buildRequest("GET", `/api/tasks?projectId=${projectId}`, { apiKey: rexApiKey });
    const res = await callRoute(listTasks, req);
    const data = await res.json();

    for (const id of batchTaskIds) {
      expect(data.some((t: any) => t.id === id)).toBe(true);
    }
  });

  // ── Step 3: Verify activity feed for all 4 creations ───────────

  it("4 task_created activities logged for the batch", async () => {
    const activities = await prisma.activity.findMany({
      where: {
        projectId,
        type: "task_created",
        taskId: { in: batchTaskIds },
      },
      orderBy: { createdAt: "asc" },
    });

    expect(activities).toHaveLength(4);

    // Each activity references the correct task title
    const messages = activities.map((a) => a.message);
    expect(messages.some((m) => m.includes("Redesign navigation bar"))).toBe(true);
    expect(messages.some((m) => m.includes("Update footer links"))).toBe(true);
    expect(messages.some((m) => m.includes("Write accessibility guidelines"))).toBe(true);
    expect(messages.some((m) => m.includes("Fix favicon"))).toBe(true);

    // All created by Kia
    expect(activities.every((a) => a.message.includes("Kia"))).toBe(true);
  });

  it("total project activity count increased by at least 4", async () => {
    const activityCountAfter = await prisma.activity.count({
      where: { projectId },
    });
    expect(activityCountAfter).toBeGreaterThanOrEqual(activityCountBefore + 4);
  });

  // ── Step 4: Verify creator auto-subscribed to all 4 tasks ─────

  it("Kia auto-subscribed to all 4 batch tasks as creator", async () => {
    for (const id of batchTaskIds) {
      const sub = await prisma.subscription.findUnique({
        where: { agentId_taskId: { agentId: kiaAgentId, taskId: id } },
      });
      expect(sub).toBeDefined();
    }
  });

  it("Rex is NOT yet subscribed to any batch task (not assigned yet)", async () => {
    for (const id of batchTaskIds) {
      const sub = await prisma.subscription.findUnique({
        where: { agentId_taskId: { agentId: rexAgentId, taskId: id } },
      });
      expect(sub).toBeNull();
    }
  });

  it("Nova has no notifications for the batch tasks (not assigned)", async () => {
    const req = buildRequest("GET", "/api/notifications", { apiKey: novaApiKey });
    const res = await callRoute(listNotifications, req);
    const data = await res.json();

    // Nova should not have any "assigned" notifications for these batch tasks
    const batchNotifs = data.filter(
      (n: any) => n.taskId && batchTaskIds.includes(n.taskId) && n.content?.includes("assigned"),
    );
    expect(batchNotifs).toHaveLength(0);
  });

  // ── Step 5: Kia assigns the high-priority task to Rex ──────────

  it("Kia assigns Rex to the high-priority task", async () => {
    subscriberCache.clear();
    const req = buildRequest("PATCH", `/api/tasks/${highPriorityTaskId}`, {
      apiKey: kiaApiKey,
      body: { assigneeIds: [rexAgentId] },
    });
    const res = await callRoute(updateTask, req, { id: highPriorityTaskId });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.assignees).toHaveLength(1);
    expect(data.assignees[0].profileId).toBe(rexProfileId);
    expect(data.priority).toBe("high");
  });

  // ── Step 6: Verify assignment cascades ─────────────────────────

  it("Rex notified of high-priority assignment", async () => {
    const req = buildRequest("GET", "/api/notifications", { apiKey: rexApiKey });
    const res = await callRoute(listNotifications, req);
    const data = await res.json();

    const assignNotif = data.find(
      (n: any) =>
        n.content?.includes("You were added to task") &&
        n.content?.includes("Redesign navigation bar"),
    );
    expect(assignNotif).toBeDefined();
    expect(assignNotif.taskId).toBe(highPriorityTaskId);
  });

  it("Rex auto-subscribed to the high-priority task only", async () => {
    // Rex should now be subscribed to the high-priority task
    const highSub = await prisma.subscription.findUnique({
      where: { agentId_taskId: { agentId: rexAgentId, taskId: highPriorityTaskId } },
    });
    expect(highSub).toBeDefined();

    // Rex should NOT be subscribed to the other 3 tasks
    const otherTaskIds = batchTaskIds.filter((id) => id !== highPriorityTaskId);
    for (const id of otherTaskIds) {
      const sub = await prisma.subscription.findUnique({
        where: { agentId_taskId: { agentId: rexAgentId, taskId: id } },
      });
      expect(sub).toBeNull();
    }
  });

  it("assignment activity logged with +Rex", async () => {
    const activity = await prisma.activity.findFirst({
      where: { taskId: highPriorityTaskId, type: "task_assigned" },
    });
    expect(activity).toBeDefined();
    expect(activity!.message).toContain("+Rex");
    expect(activity!.message).toContain("Redesign navigation bar");
  });

  it("Nova has zero assignment notifications for the batch (unchanged)", async () => {
    const req = buildRequest("GET", "/api/notifications", { apiKey: novaApiKey });
    const res = await callRoute(listNotifications, req);
    const data = await res.json();

    const batchAssignNotifs = data.filter(
      (n: any) => n.taskId && batchTaskIds.includes(n.taskId) && n.content?.includes("assigned"),
    );
    expect(batchAssignNotifs).toHaveLength(0);
  });

  // ── Step 7: Verify board state reflects batch correctly ────────

  it("board shows batch tasks in correct columns", async () => {
    projectIdsCache.clear();
    memberCache.clear();
    const req = buildRequest("GET", `/api/tasks/board?projectId=${projectId}`, {
      apiKey: kiaApiKey,
    });
    const res = await callRoute(getBoard, req);
    expect(res.status).toBe(200);

    const board = await res.json();

    // All 4 batch tasks should be in inbox (none moved yet)
    const inboxTasks = board.inbox || [];
    const batchInInbox = inboxTasks.filter((t: any) => batchTaskIds.includes(t.id));
    expect(batchInInbox).toHaveLength(4);

    // Verify the high-priority task has Rex as assignee on the board
    const highOnBoard = batchInInbox.find((t: any) => t.id === highPriorityTaskId);
    expect(highOnBoard).toBeDefined();
    expect(highOnBoard.assignees.some((a: any) => a.profileId === rexProfileId)).toBe(true);
    expect(highOnBoard.priority).toBe("high");
  });

  it("Rex's board shows only his assigned batch task", async () => {
    const req = buildRequest("GET", `/api/tasks/board?projectId=${projectId}`, {
      apiKey: rexApiKey,
    });
    const res = await callRoute(getBoard, req);
    expect(res.status).toBe(200);

    const board = await res.json();
    const allRexBoardTasks: any[] = [];
    for (const tasks of Object.values(board) as any[][]) {
      allRexBoardTasks.push(...tasks.filter((t: any) => batchTaskIds.includes(t.id)));
    }

    // Rex should only see the 1 task assigned to him from the batch
    expect(allRexBoardTasks).toHaveLength(1);
    expect(allRexBoardTasks[0].id).toBe(highPriorityTaskId);
    expect(allRexBoardTasks[0].priority).toBe("high");
  });

  // ── Step 8: Kia moves high-priority task through lifecycle ─────

  it("Kia moves high-priority task to in_progress", async () => {
    subscriberCache.clear();
    const req = buildRequest("PATCH", `/api/tasks/${highPriorityTaskId}`, {
      apiKey: kiaApiKey,
      body: { status: "in_progress" },
    });
    const res = await callRoute(updateTask, req, { id: highPriorityTaskId });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("in_progress");
  });

  it("status change activity logged for high-priority task", async () => {
    const activity = await prisma.activity.findFirst({
      where: {
        taskId: highPriorityTaskId,
        type: "task_updated",
        message: { contains: "inbox" },
      },
    });
    expect(activity).toBeDefined();
    expect(activity!.message).toContain("in_progress");
  });

  it("Rex notified of status change (as subscriber, Kia is changedBy)", async () => {
    subscriberCache.clear();
    const req = buildRequest("GET", "/api/notifications", { apiKey: rexApiKey });
    const res = await callRoute(listNotifications, req);
    const data = await res.json();

    const statusNotif = data.find(
      (n: any) => n.taskId === highPriorityTaskId && n.content?.includes("moved to in_progress"),
    );
    expect(statusNotif).toBeDefined();
  });

  // ── Step 9: Verify individual task GET returns full detail ─────

  it("GET high-priority task returns correct detail with assignee and priority", async () => {
    const req = buildRequest("GET", `/api/tasks/${highPriorityTaskId}`, { apiKey: rexApiKey });
    const res = await callRoute(getTask, req, { id: highPriorityTaskId });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.title).toBe("Redesign navigation bar");
    expect(data.priority).toBe("high");
    expect(data.status).toBe("in_progress");
    expect(data.projectId).toBe(projectId);
    expect(data.assignees).toHaveLength(1);
    expect(data.assignees[0].profileId).toBe(rexProfileId);
  });

  it("GET low-priority task has no assignees", async () => {
    const lowTaskId = batchTaskIds[3]; // "Fix favicon"
    const req = buildRequest("GET", `/api/tasks/${lowTaskId}`, { apiKey: kiaApiKey });
    const res = await callRoute(getTask, req, { id: lowTaskId });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.title).toBe("Fix favicon");
    expect(data.priority).toBe("low");
    expect(data.status).toBe("inbox");
    expect(data.assignees).toHaveLength(0);
  });

  // ── Step 10: Cross-check subscription state after all operations ─

  it("final subscription state: Kia on all 4, Rex on high only", async () => {
    // Kia subscribed to all 4
    for (const id of batchTaskIds) {
      const kiaSub = await prisma.subscription.findUnique({
        where: { agentId_taskId: { agentId: kiaAgentId, taskId: id } },
      });
      expect(kiaSub).toBeDefined();
    }

    // Rex subscribed only to high-priority
    const rexSubs = await prisma.subscription.findMany({
      where: { agentId: rexAgentId, taskId: { in: batchTaskIds } },
    });
    expect(rexSubs).toHaveLength(1);
    expect(rexSubs[0].taskId).toBe(highPriorityTaskId);

    // Nova subscribed to none
    const novaSubs = await prisma.subscription.findMany({
      where: { agentId: novaAgentId, taskId: { in: batchTaskIds } },
    });
    expect(novaSubs).toHaveLength(0);
  });

  // ── Step 11: Clean up batch tasks for subsequent tests ─────────

  it("Kia deletes all 4 batch tasks", async () => {
    for (const id of batchTaskIds) {
      const req = buildRequest("DELETE", `/api/tasks/${id}`, { apiKey: kiaApiKey });
      const res = await callRoute(deleteTask, req, { id });
      expect(res.status).toBe(200);
    }

    // Verify none remain
    const req = buildRequest("GET", `/api/tasks?projectId=${projectId}`, { apiKey: kiaApiKey });
    const res = await callRoute(listTasks, req);
    const data = await res.json();
    for (const id of batchTaskIds) {
      expect(data.some((t: any) => t.id === id)).toBe(false);
    }
  });
});

// ════════════════════════════════════════════════════════════════════
// 14¾. REAL-TIME PUBSUB EVENTS (SSE VERIFICATION)
// ════════════════════════════════════════════════════════════════════
//
// The dashboard uses GraphQL subscriptions (delivered via SSE) to power
// real-time updates: board refreshes, activity feed, notifications,
// live message threads. All subscriptions consume from the in-memory
// pubsub bus. These tests subscribe directly to pubsub and verify that
// every write operation publishes the correct event — if a publish is
// missing, the board / feed goes stale until the next poll.
//
// Event channels tested:
//   TASK.UPDATED        — board columns, task detail panels
//   ACTIVITY.CREATED    — activity feed sidebar
//   NOTIFICATION.CREATED — notification bell badge
//   MESSAGE.CREATED     — live chat thread
//   MESSAGE.REACTION_CHANGED — inline reaction counts

describe("14¾. Real-Time PubSub Events (SSE Verification)", () => {
  // Helper: subscribe to a pubsub channel, perform an action, and
  // collect the first event within a timeout. Returns null on timeout.
  //
  // CRITICAL: the iterator must start listening BEFORE the action fires,
  // because pubsub.publish() delivers synchronously to active subscribers.
  async function collectEvent<T>(
    channel: string,
    action: () => Promise<void>,
    timeoutMs = 2000,
  ): Promise<T | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const iterator = (pubsub as any).subscribe(channel) as AsyncIterableIterator<T>;
    try {
      // Start listening BEFORE the action — events fire synchronously
      const eventPromise = Promise.race([
        iterator.next().then((r) => (r.done ? null : r.value)),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
      ]);

      // Now perform the action that triggers the event
      await action();

      // Wait for the event (or timeout)
      return await eventPromise;
    } finally {
      iterator.return?.();
    }
  }

  let sseTaskId: string;
  let sseMessageId: string;

  // ── TASK.UPDATED — task creation ───────────────────────────────

  it("task creation publishes TASK.UPDATED event", async () => {
    const event = await collectEvent<{ taskId: string; projectId?: string }>(
      PubSubEvent.TASK.UPDATED,
      async () => {
        const req = buildRequest("POST", "/api/tasks", {
          apiKey: kiaApiKey,
          body: {
            title: "SSE test: real-time task",
            description: "Verify this task fires a pubsub event for the board",
            projectId,
            priority: "high",
          },
        });
        const res = await callRoute(createTaskHandler, req);
        expect(res.status).toBe(201);
        sseTaskId = (await res.json()).id;
      },
    );

    expect(event).not.toBeNull();
    expect(event!.taskId).toBe(sseTaskId);
  });

  // ── ACTIVITY.CREATED — task creation side-effect ───────────────

  it("task creation publishes ACTIVITY.CREATED event", async () => {
    const event = await collectEvent<{ activityId: string; projectId?: string }>(
      PubSubEvent.ACTIVITY.CREATED,
      async () => {
        // Assign Rex — this triggers task.assignees_changed → activity handler
        subscriberCache.clear();
        const req = buildRequest("PATCH", `/api/tasks/${sseTaskId}`, {
          apiKey: kiaApiKey,
          body: { assigneeIds: [rexAgentId] },
        });
        const res = await callRoute(updateTask, req, { id: sseTaskId });
        expect(res.status).toBe(200);
      },
    );

    expect(event).not.toBeNull();
    expect(event!.activityId).toBeTruthy();
  });

  // ── TASK.UPDATED — status change ──────────────────────────────

  it("task status change publishes TASK.UPDATED event", async () => {
    const event = await collectEvent<{ taskId: string }>(PubSubEvent.TASK.UPDATED, async () => {
      const req = buildRequest("PATCH", `/api/tasks/${sseTaskId}`, {
        apiKey: rexApiKey,
        body: { status: "in_progress" },
      });
      const res = await callRoute(updateTask, req, { id: sseTaskId });
      expect(res.status).toBe(200);
    });

    expect(event).not.toBeNull();
    expect(event!.taskId).toBe(sseTaskId);
  });

  // ── NOTIFICATION.CREATED — status change notifies subscriber ──

  it("status change publishes NOTIFICATION.CREATED for subscribers", async () => {
    subscriberCache.clear();
    const event = await collectEvent<{ agentId: string; notificationId: string }>(
      notificationTopic(rexAgentId),
      async () => {
        // Kia moves to review — Rex (assignee/subscriber) should be notified
        const req = buildRequest("PATCH", `/api/tasks/${sseTaskId}`, {
          apiKey: kiaApiKey,
          body: { status: "review" },
        });
        const res = await callRoute(updateTask, req, { id: sseTaskId });
        expect(res.status).toBe(200);
      },
    );

    expect(event).not.toBeNull();
    expect(event!.notificationId).toBeTruthy();
    // Notification should be for a subscriber (Rex), not the changer (Kia)
    expect(event!.agentId).toBe(rexAgentId);
  });

  // ── MESSAGE.CREATED — new message on task ─────────────────────

  it("message post publishes MESSAGE.CREATED event", async () => {
    const event = await collectEvent<{ taskId: string; messageId: string }>(
      messageTopic(sseTaskId),
      async () => {
        const req = buildRequest("POST", `/api/tasks/${sseTaskId}/messages`, {
          apiKey: rexApiKey,
          body: { content: "SSE test: this message should trigger a real-time event" },
        });
        const res = await callRoute(createMessage, req, { id: sseTaskId });
        expect(res.status).toBe(201);
        sseMessageId = (await res.json()).id;
      },
    );

    expect(event).not.toBeNull();
    expect(event!.taskId).toBe(sseTaskId);
    expect(event!.messageId).toBe(sseMessageId);
  });

  // ── NOTIFICATION.CREATED — @mention triggers notification ─────

  it("@mention publishes NOTIFICATION.CREATED for mentioned agent", async () => {
    subscriberCache.clear();
    const event = await collectEvent<{ agentId: string; notificationId: string }>(
      notificationTopic(novaAgentId),
      async () => {
        const req = buildRequest("POST", `/api/tasks/${sseTaskId}/messages`, {
          apiKey: rexApiKey,
          body: { content: "Hey @nova check the SSE event stream" },
        });
        const res = await callRoute(createMessage, req, { id: sseTaskId });
        expect(res.status).toBe(201);
      },
    );

    expect(event).not.toBeNull();
    expect(event!.notificationId).toBeTruthy();
    // The first notification published should be for the mentioned agent
    expect(event!.agentId).toBe(novaAgentId);
  });

  // ── MESSAGE.REACTION_CHANGED — emoji reaction ─────────────────

  it("reaction toggle publishes MESSAGE.REACTION_CHANGED event", async () => {
    const event = await collectEvent<{ taskId: string; messageId: string }>(
      messageReactionTopic(sseTaskId),
      async () => {
        const req = buildRequest("POST", `/api/messages/${sseMessageId}/reactions`, {
          apiKey: novaApiKey,
          body: { emoji: "heart" },
        });
        const res = await callRoute(reactToMessage, req, { id: sseMessageId });
        expect(res.status).toBe(200);
      },
    );

    expect(event).not.toBeNull();
    expect(event!.taskId).toBe(sseTaskId);
    expect(event!.messageId).toBe(sseMessageId);
  });

  // ── ACTIVITY.CREATED — message activity side-effect ────────────

  it("message post publishes ACTIVITY.CREATED for activity feed", async () => {
    const event = await collectEvent<{ activityId: string; projectId?: string }>(
      PubSubEvent.ACTIVITY.CREATED,
      async () => {
        const req = buildRequest("POST", `/api/tasks/${sseTaskId}/messages`, {
          apiKey: kiaApiKey,
          body: { content: "Looks good, shipping this" },
        });
        const res = await callRoute(createMessage, req, { id: sseTaskId });
        expect(res.status).toBe(201);
      },
    );

    expect(event).not.toBeNull();
    expect(event!.activityId).toBeTruthy();
    expect(event!.projectId).toBe(projectId);
  });

  // ── TASK.UPDATED — task deletion ──────────────────────────────

  it("task deletion publishes TASK.UPDATED event (board removal)", async () => {
    const event = await collectEvent<{ taskId: string }>(PubSubEvent.TASK.UPDATED, async () => {
      const req = buildRequest("DELETE", `/api/tasks/${sseTaskId}`, { apiKey: kiaApiKey });
      const res = await callRoute(deleteTask, req, { id: sseTaskId });
      expect(res.status).toBe(200);
    });

    expect(event).not.toBeNull();
    expect(event!.taskId).toBe(sseTaskId);
  });

  // ── Verify no stale events leak to wrong channels ──────────────

  it("no TASK.UPDATED event when only a message is posted", async () => {
    // Create a throwaway task first (this fires TASK.UPDATED, but we don't listen yet)
    const createReq = buildRequest("POST", "/api/tasks", {
      apiKey: kiaApiKey,
      body: {
        title: "SSE isolation test",
        description: "Verify message doesn't trigger task event",
        projectId,
      },
    });
    const createRes = await callRoute(createTaskHandler, createReq);
    const tempTaskId = (await createRes.json()).id;

    // Now subscribe to TASK.UPDATED and only post a message (no task mutation)
    const taskEvent = await collectEvent<{ taskId: string }>(
      PubSubEvent.TASK.UPDATED,
      async () => {
        const msgReq = buildRequest("POST", `/api/tasks/${tempTaskId}/messages`, {
          apiKey: rexApiKey,
          body: { content: "This should NOT trigger TASK.UPDATED" },
        });
        await callRoute(createMessage, msgReq, { id: tempTaskId });
      },
      500, // short timeout — we expect nothing
    );

    expect(taskEvent).toBeNull(); // message should NOT trigger task updated

    // Clean up
    await callRoute(
      deleteTask,
      buildRequest("DELETE", `/api/tasks/${tempTaskId}`, { apiKey: kiaApiKey }),
      { id: tempTaskId },
    );
  });
});

// ════════════════════════════════════════════════════════════════════
// A. AGENT FULL LIFECYCLE FLOW
// ════════════════════════════════════════════════════════════════════
//
// Uses Rex and Nova. Verifies the complete happy-path from task creation
// through delivery: create → assign → comment → deliverable → board.

describe("A. Agent Full Lifecycle Flow", () => {
  it("Rex creates a task assigned to himself", async () => {
    subscriberCache.clear();
    const req = buildRequest("POST", "/api/tasks", {
      apiKey: rexApiKey,
      body: {
        title: "Lifecycle: build dashboard widget",
        description: "End-to-end lifecycle test task",
        assigneeIds: [rexAgentId],
      },
    });
    const res = await callRoute(createTaskHandler, req);
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.assignees).toHaveLength(1);
    expect(data.assignees[0].profileId).toBe(rexProfileId);
    lifecycleTaskId = data.id;
  });

  it("task creation activity logged", async () => {
    const activity = await prisma.activity.findFirst({
      where: { taskId: lifecycleTaskId, type: "task_created" },
    });
    expect(activity).not.toBeNull();
    expect(activity!.message).toContain("Lifecycle");
  });

  it("Rex assigns Nova to the task alongside himself", async () => {
    subscriberCache.clear();
    const req = buildRequest("PATCH", `/api/tasks/${lifecycleTaskId}`, {
      apiKey: rexApiKey,
      body: { assigneeIds: [rexAgentId, novaAgentId] },
    });
    const res = await callRoute(updateTask, req, { id: lifecycleTaskId });
    expect(res.status).toBe(200);

    const data = await res.json();
    const profileIds = data.assignees.map((a: any) => a.profileId);
    expect(profileIds).toContain(rexProfileId);
    expect(profileIds).toContain(novaProfileId);
  });

  it("assignment activity logged with +Nova", async () => {
    const activity = await prisma.activity.findFirst({
      where: {
        taskId: lifecycleTaskId,
        type: NotificationKind.TASK_ASSIGNED,
        message: { contains: "+Nova" },
      },
    });
    expect(activity).not.toBeNull();
  });

  it("Nova receives assignment notification", async () => {
    const req = buildRequest("GET", "/api/notifications", { apiKey: novaApiKey });
    const res = await callRoute(listNotifications, req);
    const data = await res.json();
    const assignNotif = data.find(
      (n: any) => n.content?.includes("added to task") && n.taskId === lifecycleTaskId,
    );
    expect(assignNotif).toBeDefined();
  });

  it("Nova auto-subscribed to the task", async () => {
    const sub = await prisma.subscription.findUnique({
      where: { agentId_taskId: { agentId: novaAgentId, taskId: lifecycleTaskId } },
    });
    expect(sub).toBeDefined();
  });

  it("Nova comments on the task", async () => {
    const req = buildRequest("POST", `/api/tasks/${lifecycleTaskId}/messages`, {
      apiKey: novaApiKey,
      body: { content: "Starting research for the dashboard widget" },
    });
    const res = await callRoute(createMessage, req, { id: lifecycleTaskId });
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.fromProfile.displayName).toBe("Nova");
  });

  it("comment activity logged", async () => {
    const activity = await prisma.activity.findFirst({
      where: { taskId: lifecycleTaskId, type: "message_sent" },
    });
    expect(activity).not.toBeNull();
    expect(activity!.message).toContain("Nova");
  });

  it("Rex notified of Nova's comment (as subscriber)", async () => {
    const req = buildRequest("GET", "/api/notifications", { apiKey: rexApiKey });
    const res = await callRoute(listNotifications, req);
    const data = await res.json();
    const commentNotif = data.find(
      (n: any) => n.taskId === lifecycleTaskId && n.content?.includes("commented"),
    );
    expect(commentNotif).toBeDefined();
  });

  it("Nova adds a deliverable", async () => {
    const req = buildRequest("POST", `/api/tasks/${lifecycleTaskId}/deliverables`, {
      apiKey: novaApiKey,
      body: {
        title: "Widget Research Report",
        kind: "markdown",
        content: "# Dashboard Widget Research\n\nFindings and recommendations.",
      },
    });
    const res = await callRoute(createDeliverable, req, { id: lifecycleTaskId });
    expect(res.status).toBe(201);

    const data = await res.json();
    lifecycleDeliverableId = data.id;
    expect(data.version).toBe(1);
  });

  it("deliverable activity logged", async () => {
    const activity = await prisma.activity.findFirst({
      where: { taskId: lifecycleTaskId, type: "deliverable_submitted" },
    });
    expect(activity).not.toBeNull();
    expect(activity!.message).toContain("submitted");
  });

  it("Rex can see Nova's deliverable", async () => {
    const req = buildRequest("GET", `/api/tasks/${lifecycleTaskId}/deliverables`, {
      apiKey: rexApiKey,
    });
    const res = await callRoute(listDeliverables, req, { id: lifecycleTaskId });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.some((d: any) => d.id === lifecycleDeliverableId)).toBe(true);
  });

  it("Nova can update her deliverable", async () => {
    const req = buildRequest(
      "PATCH",
      `/api/tasks/${lifecycleTaskId}/deliverables/${lifecycleDeliverableId}`,
      {
        apiKey: novaApiKey,
        body: {
          title: "Widget Research Report v2",
          content: "# Updated Research\n\nRevised findings.",
        },
      },
    );
    const res = await callRoute(updateDeliverable, req, {
      id: lifecycleTaskId,
      deliverableId: lifecycleDeliverableId,
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.version).toBe(2);
  });

  it("Rex cannot update Nova's deliverable — 403", async () => {
    const req = buildRequest(
      "PATCH",
      `/api/tasks/${lifecycleTaskId}/deliverables/${lifecycleDeliverableId}`,
      {
        apiKey: rexApiKey,
        body: { title: "Hijacked by Rex" },
      },
    );
    const res = await callRoute(updateDeliverable, req, {
      id: lifecycleTaskId,
      deliverableId: lifecycleDeliverableId,
    });
    expect(res.status).toBe(403);
  });

  it("Nova moves task to in_progress", async () => {
    const req = buildRequest("PATCH", `/api/tasks/${lifecycleTaskId}`, {
      apiKey: novaApiKey,
      body: { status: "in_progress" },
    });
    const res = await callRoute(updateTask, req, { id: lifecycleTaskId });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("in_progress");
  });

  it("status change notification sent to Rex", async () => {
    subscriberCache.clear();
    const req = buildRequest("GET", "/api/notifications", { apiKey: rexApiKey });
    const res = await callRoute(listNotifications, req);
    const data = await res.json();
    const statusNotif = data.find(
      (n: any) => n.taskId === lifecycleTaskId && n.content?.includes("in_progress"),
    );
    expect(statusNotif).toBeDefined();
  });

  it("board shows task for Nova (assignee)", async () => {
    projectIdsCache.clear();
    memberCache.clear();
    const req = buildRequest("GET", "/api/tasks/board", { apiKey: novaApiKey });
    const res = await callRoute(getBoard, req);
    expect(res.status).toBe(200);

    const board = await res.json();
    const allTasks = Object.values(board).flat() as any[];
    expect(allTasks.some((t: any) => t.id === lifecycleTaskId)).toBe(true);
  });

  it("cleanup: delete lifecycle task", async () => {
    const req = buildRequest("DELETE", `/api/tasks/${lifecycleTaskId}`, { apiKey: rexApiKey });
    const res = await callRoute(deleteTask, req, { id: lifecycleTaskId });
    expect(res.status).toBe(200);
  });
});

// ════════════════════════════════════════════════════════════════════
// B. PROJECT ACCESS CONTROL — SCOPED OPERATIONS
// ════════════════════════════════════════════════════════════════════
//
// Uses Kia (Squad Lead), Rex (member), Sage (non-member). Tests that
// project scoping blocks non-members from task operations.

describe("B. Project Access Control — Scoped Operations", () => {
  it("resolves profile IDs for Kia and Sage", async () => {
    kiaProfileId = await getOrCreateAgentProfileId(kiaAgentId);
    sageProfileId = await getOrCreateAgentProfileId(sageAgentId);
    expect(kiaProfileId).toBeTruthy();
    expect(sageProfileId).toBeTruthy();
  });

  it("ensure Sage is non-member (remove if present)", async () => {
    // Try to remove Sage — ignore errors if not a member
    const req = buildRequest("DELETE", `/api/projects/${projectId}/members`, {
      apiKey: kiaApiKey,
      body: { agentId: sageAgentId },
    });
    await callRoute(removeMember, req, { id: projectId });
    memberCache.clear();
    projectIdsCache.clear();
  });

  it("Kia creates a project-scoped task assigned to Rex", async () => {
    subscriberCache.clear();
    const req = buildRequest("POST", "/api/tasks", {
      apiKey: kiaApiKey,
      body: {
        title: "Access control: restricted project task",
        description: "Only project members should access this",
        projectId,
        assigneeIds: [rexAgentId],
      },
    });
    const res = await callRoute(createTaskHandler, req);
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.projectId).toBe(projectId);
    accessControlTaskId = data.id;
  });

  it("Rex (member) can view the task", async () => {
    memberCache.clear();
    projectIdsCache.clear();
    const req = buildRequest("GET", `/api/tasks/${accessControlTaskId}`, { apiKey: rexApiKey });
    const res = await callRoute(getTask, req, { id: accessControlTaskId });
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe("Access control: restricted project task");
  });

  it("Sage (non-member) cannot view — 403", async () => {
    memberCache.clear();
    const req = buildRequest("GET", `/api/tasks/${accessControlTaskId}`, { apiKey: sageApiKey });
    const res = await callRoute(getTask, req, { id: accessControlTaskId });
    expect(res.status).toBe(403);
  });

  it("Sage cannot update — 403", async () => {
    const req = buildRequest("PATCH", `/api/tasks/${accessControlTaskId}`, {
      apiKey: sageApiKey,
      body: { title: "Hacked by Sage" },
    });
    const res = await callRoute(updateTask, req, { id: accessControlTaskId });
    expect(res.status).toBe(403);
  });

  it("Sage cannot delete — 403", async () => {
    const req = buildRequest("DELETE", `/api/tasks/${accessControlTaskId}`, { apiKey: sageApiKey });
    const res = await callRoute(deleteTask, req, { id: accessControlTaskId });
    expect(res.status).toBe(403);
  });

  it("Rex comments on the project task", async () => {
    const req = buildRequest("POST", `/api/tasks/${accessControlTaskId}/messages`, {
      apiKey: rexApiKey,
      body: { content: "Working on the access-controlled task" },
    });
    const res = await callRoute(createMessage, req, { id: accessControlTaskId });
    expect(res.status).toBe(201);
  });

  it("Rex adds a deliverable", async () => {
    const req = buildRequest("POST", `/api/tasks/${accessControlTaskId}/deliverables`, {
      apiKey: rexApiKey,
      body: {
        title: "Access Control Report",
        kind: "markdown",
        content: "# Access Control\n\nVerification complete.",
      },
    });
    const res = await callRoute(createDeliverable, req, { id: accessControlTaskId });
    expect(res.status).toBe(201);
  });

  it("Rex lists deliverables", async () => {
    const req = buildRequest("GET", `/api/tasks/${accessControlTaskId}/deliverables`, {
      apiKey: rexApiKey,
    });
    const res = await callRoute(listDeliverables, req, { id: accessControlTaskId });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.some((d: any) => d.title === "Access Control Report")).toBe(true);
  });

  it("Rex lists messages", async () => {
    const req = buildRequest("GET", `/api/tasks/${accessControlTaskId}/messages`, {
      apiKey: rexApiKey,
    });
    const res = await callRoute(listMessages, req, { id: accessControlTaskId });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.some((m: any) => m.content === "Working on the access-controlled task")).toBe(true);
  });

  it("Kia's board shows the task (Squad Lead sees all)", async () => {
    projectIdsCache.clear();
    memberCache.clear();
    const req = buildRequest("GET", `/api/tasks/board?projectId=${projectId}`, {
      apiKey: kiaApiKey,
    });
    const res = await callRoute(getBoard, req);
    expect(res.status).toBe(200);

    const board = await res.json();
    const allTasks = Object.values(board).flat() as any[];
    expect(allTasks.some((t: any) => t.id === accessControlTaskId)).toBe(true);
  });

  it("Rex's board shows the task (assigned member)", async () => {
    const req = buildRequest("GET", `/api/tasks/board?projectId=${projectId}`, {
      apiKey: rexApiKey,
    });
    const res = await callRoute(getBoard, req);
    expect(res.status).toBe(200);

    const board = await res.json();
    const allTasks = Object.values(board).flat() as any[];
    expect(allTasks.some((t: any) => t.id === accessControlTaskId)).toBe(true);
  });

  it("cannot assign non-member Sage to project task — 400", async () => {
    const req = buildRequest("PATCH", `/api/tasks/${accessControlTaskId}`, {
      apiKey: kiaApiKey,
      body: { assigneeIds: [rexAgentId, sageAgentId] },
    });
    const res = await callRoute(updateTask, req, { id: accessControlTaskId });
    expect(res.status).toBe(400);
  });

  it("cleanup: Kia deletes the project task", async () => {
    const req = buildRequest("DELETE", `/api/tasks/${accessControlTaskId}`, { apiKey: kiaApiKey });
    const res = await callRoute(deleteTask, req, { id: accessControlTaskId });
    expect(res.status).toBe(200);
  });
});

// ════════════════════════════════════════════════════════════════════
// C. HUMAN USER DASHBOARD FLOW (GRAPHQL)
// ════════════════════════════════════════════════════════════════════
//
// Uses admin session cookie. Calls the GraphQL endpoint directly with
// session cookie header to test dashboard-initiated operations.

describe("C. Human User Dashboard Flow (GraphQL)", () => {
  let adminProfileId: string;

  it("unauthenticated me query returns null", async () => {
    const result = await runGraphQL(`query { me { id displayName } }`);
    expect(result.errors).toBeFalsy();
    expect(result.data?.me).toBeNull();
  });

  it("authenticated admin me query returns profile", async () => {
    const result = await runGraphQL(
      `query { me { id displayName username kind } }`,
      undefined,
      sessionCookie,
    );
    expect(result.errors).toBeFalsy();
    expect(result.data?.me).toBeDefined();
    expect(result.data.me.displayName).toBeTruthy();
    adminProfileId = result.data.me.id;
  });

  it("admin creates task via createTaskFromDashboard", async () => {
    const result = await runGraphQL(
      `mutation CreateTask($title: String!, $description: String!) {
        createTaskFromDashboard(title: $title, description: $description) {
          id title description status createdByProfileId
          createdByProfile { id displayName }
        }
      }`,
      { title: "Dashboard task: user onboarding flow", description: "Design the onboarding UX" },
      sessionCookie,
    );

    expect(result.errors).toBeFalsy();
    const task = result.data?.createTaskFromDashboard;
    expect(task).toBeDefined();
    expect(task.title).toBe("Dashboard task: user onboarding flow");
    expect(task.status).toBe("inbox");
    expect(task.createdByProfileId).toBe(adminProfileId);
    expect(task.createdByProfile.displayName).toBeTruthy();
    dashboardTaskId = task.id;
  });

  it("admin lists tasks — new task appears", async () => {
    const result = await runGraphQL(`query { tasks { id title } }`, undefined, sessionCookie);
    expect(result.errors).toBeFalsy();
    const tasks = result.data?.tasks as any[];
    expect(tasks.some((t: any) => t.id === dashboardTaskId)).toBe(true);
  });

  it("admin updates task title", async () => {
    const result = await runGraphQL(
      `mutation UpdateTask($id: String!, $title: String) {
        updateTask(id: $id, title: $title) { id title }
      }`,
      { id: dashboardTaskId, title: "Dashboard task: user onboarding flow v2" },
      sessionCookie,
    );
    expect(result.errors).toBeFalsy();
    expect(result.data?.updateTask.title).toBe("Dashboard task: user onboarding flow v2");
  });

  it("admin sends message on task", async () => {
    const result = await runGraphQL(
      `mutation SendMessage($taskId: String!, $fromProfileId: String!, $content: String!) {
        createMessage(taskId: $taskId, fromProfileId: $fromProfileId, content: $content) {
          id content fromProfileId
          fromProfile { id displayName }
        }
      }`,
      {
        taskId: dashboardTaskId,
        fromProfileId: adminProfileId,
        content: "Let's prioritize the onboarding flow",
      },
      sessionCookie,
    );
    expect(result.errors).toBeFalsy();
    const msg = result.data?.createMessage;
    expect(msg.content).toContain("prioritize the onboarding flow");
    expect(msg.fromProfile.id).toBe(adminProfileId);
  });

  it("admin lists task messages — message appears", async () => {
    const result = await runGraphQL(
      `query Messages($taskId: String!) {
        messagesByTask(taskId: $taskId) { id content fromProfileId }
      }`,
      { taskId: dashboardTaskId },
      sessionCookie,
    );
    expect(result.errors).toBeFalsy();
    const msgs = result.data?.messagesByTask as any[];
    expect(msgs.length).toBeGreaterThan(0);
    expect(msgs.some((m: any) => m.fromProfileId === adminProfileId)).toBe(true);
  });

  it("admin submits deliverable", async () => {
    const result = await runGraphQL(
      `mutation Submit($taskId: String!, $agentId: String!, $title: String!, $kind: String!, $content: String) {
        submitDeliverable(taskId: $taskId, agentId: $agentId, title: $title, kind: $kind, content: $content) {
          id title kind version
        }
      }`,
      {
        taskId: dashboardTaskId,
        agentId: rexAgentId,
        title: "Onboarding Wireframes",
        kind: "markdown",
        content: "# Wireframes\n\nStep-by-step onboarding screens.",
      },
      sessionCookie,
    );
    expect(result.errors).toBeFalsy();
    const del = result.data?.submitDeliverable;
    expect(del.title).toBe("Onboarding Wireframes");
    expect(del.version).toBe(1);
  });

  it("admin lists deliverables — deliverable appears", async () => {
    const result = await runGraphQL(
      `query Deliverables($taskId: String!) {
        deliverablesByTask(taskId: $taskId) { id title kind }
      }`,
      { taskId: dashboardTaskId },
      sessionCookie,
    );
    expect(result.errors).toBeFalsy();
    const deliverables = result.data?.deliverablesByTask as any[];
    expect(deliverables.some((d: any) => d.title === "Onboarding Wireframes")).toBe(true);
  });

  it("cleanup: delete dashboard task", async () => {
    const result = await runGraphQL(
      `mutation DeleteTask($id: String!, $agentId: String!) {
        deleteTask(id: $id, agentId: $agentId)
      }`,
      { id: dashboardTaskId, agentId: rexAgentId },
      sessionCookie,
    );
    expect(result.errors).toBeFalsy();
    expect(result.data?.deleteTask).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════
// D. ASSIGNMENT & SUBSCRIPTION EDGE CASES
// ════════════════════════════════════════════════════════════════════
//
// Tests assignee removal notifications, subscription cleanup,
// self-assignment, and reassignment flows.

describe("D. Assignment & Subscription Edge Cases", () => {
  let edgeTaskId: string;

  it("Rex creates a task and assigns Nova", async () => {
    subscriberCache.clear();
    const req = buildRequest("POST", "/api/tasks", {
      apiKey: rexApiKey,
      body: {
        title: "Assignment edge case task",
        description: "Testing assignment edge cases",
        assigneeIds: [novaAgentId],
      },
    });
    const res = await callRoute(createTaskHandler, req);
    expect(res.status).toBe(201);
    const data = await res.json();
    edgeTaskId = data.id;
    expect(data.assignees).toHaveLength(1);
    expect(data.assignees[0].profileId).toBe(novaProfileId);
  });

  it("Nova receives creation-time assignment notification", async () => {
    const req = buildRequest("GET", "/api/notifications", { apiKey: novaApiKey });
    const res = await callRoute(listNotifications, req);
    const data = await res.json();
    const assignNotif = data.find(
      (n: any) => n.taskId === edgeTaskId && n.content?.includes("assigned to task"),
    );
    expect(assignNotif).toBeDefined();
  });

  it("Nova auto-subscribed from creation-time assignment", async () => {
    const sub = await prisma.subscription.findUnique({
      where: { agentId_taskId: { agentId: novaAgentId, taskId: edgeTaskId } },
    });
    expect(sub).toBeDefined();
  });

  it("Rex (creator) auto-subscribed to the task", async () => {
    const sub = await prisma.subscription.findUnique({
      where: { agentId_taskId: { agentId: rexAgentId, taskId: edgeTaskId } },
    });
    expect(sub).toBeDefined();
  });

  it("Rex removes Nova from assignees (PATCH assigneeIds: [])", async () => {
    subscriberCache.clear();
    const req = buildRequest("PATCH", `/api/tasks/${edgeTaskId}`, {
      apiKey: rexApiKey,
      body: { assigneeIds: [] },
    });
    const res = await callRoute(updateTask, req, { id: edgeTaskId });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.assignees).toHaveLength(0);
  });

  it("removal activity logged with -Nova", async () => {
    const activity = await prisma.activity.findFirst({
      where: {
        taskId: edgeTaskId,
        type: NotificationKind.TASK_ASSIGNED,
        message: { contains: "-Nova" },
      },
    });
    expect(activity).not.toBeNull();
  });

  it("Nova receives 'removed from task' notification", async () => {
    const req = buildRequest("GET", "/api/notifications", { apiKey: novaApiKey });
    const res = await callRoute(listNotifications, req);
    const data = await res.json();
    const removeNotif = data.find(
      (n: any) => n.taskId === edgeTaskId && n.content?.includes("removed from task"),
    );
    expect(removeNotif).toBeDefined();
  });

  it("Nova's subscription deleted after removal", async () => {
    const sub = await prisma.subscription.findUnique({
      where: { agentId_taskId: { agentId: novaAgentId, taskId: edgeTaskId } },
    });
    expect(sub).toBeNull();
  });

  it("Rex replaces himself with Nova (swap assignees)", async () => {
    // First assign Rex
    subscriberCache.clear();
    await callRoute(
      updateTask,
      buildRequest("PATCH", `/api/tasks/${edgeTaskId}`, {
        apiKey: rexApiKey,
        body: { assigneeIds: [rexAgentId] },
      }),
      { id: edgeTaskId },
    );

    // Now swap: remove Rex, add Nova
    subscriberCache.clear();
    const req = buildRequest("PATCH", `/api/tasks/${edgeTaskId}`, {
      apiKey: rexApiKey,
      body: { assigneeIds: [novaAgentId] },
    });
    const res = await callRoute(updateTask, req, { id: edgeTaskId });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.assignees).toHaveLength(1);
    expect(data.assignees[0].profileId).toBe(novaProfileId);
  });

  it("swap activity logged with +Nova and -Rex", async () => {
    const activity = await prisma.activity.findFirst({
      where: {
        taskId: edgeTaskId,
        type: NotificationKind.TASK_ASSIGNED,
        message: { contains: "+Nova" },
      },
      orderBy: { createdAt: "desc" },
    });
    expect(activity).not.toBeNull();
    expect(activity!.message).toContain("-Rex");
  });

  it("message author gets auto-subscribed even without mention or assignment", async () => {
    // Sage posts a message on the task (not assigned, not mentioned)
    // But Sage can't access project tasks... use the edge task which is non-project
    subscriberCache.clear();
    const req = buildRequest("POST", `/api/tasks/${edgeTaskId}/messages`, {
      apiKey: sageApiKey,
      body: { content: "I'm just passing by with a comment" },
    });
    const res = await callRoute(createMessage, req, { id: edgeTaskId });
    expect(res.status).toBe(201);

    const sub = await prisma.subscription.findUnique({
      where: { agentId_taskId: { agentId: sageAgentId, taskId: edgeTaskId } },
    });
    expect(sub).toBeDefined();
  });

  it("cleanup: delete edge case task", async () => {
    const req = buildRequest("DELETE", `/api/tasks/${edgeTaskId}`, { apiKey: rexApiKey });
    const res = await callRoute(deleteTask, req, { id: edgeTaskId });
    expect(res.status).toBe(200);
  });
});

// ════════════════════════════════════════════════════════════════════
// E. ACTIVITY & NOTIFICATION COMPLETENESS
// ════════════════════════════════════════════════════════════════════
//
// Tests activity types and notification paths not covered elsewhere:
// task_fields_updated, task_completed (direct status→done),
// queue item activities, and subscriber-based comment notifications.

describe("E. Activity & Notification Completeness", () => {
  let actTaskId: string;

  it("Rex creates a task for activity testing", async () => {
    subscriberCache.clear();
    const req = buildRequest("POST", "/api/tasks", {
      apiKey: rexApiKey,
      body: {
        title: "Activity completeness task",
        description: "Testing all activity and notification paths",
      },
    });
    const res = await callRoute(createTaskHandler, req);
    expect(res.status).toBe(201);
    actTaskId = (await res.json()).id;
  });

  it("updating only description generates task_fields_updated activity (task_updated type)", async () => {
    const req = buildRequest("PATCH", `/api/tasks/${actTaskId}`, {
      apiKey: rexApiKey,
      body: { description: "Updated description for activity test" },
    });
    const res = await callRoute(updateTask, req, { id: actTaskId });
    expect(res.status).toBe(200);

    const activity = await prisma.activity.findFirst({
      where: {
        taskId: actTaskId,
        type: "task_updated",
        message: { contains: "updated" },
      },
    });
    expect(activity).not.toBeNull();
  });

  it("moving task directly to 'done' creates task_completed activity", async () => {
    const req = buildRequest("PATCH", `/api/tasks/${actTaskId}`, {
      apiKey: rexApiKey,
      body: { status: TaskStatus.DONE },
    });
    const res = await callRoute(updateTask, req, { id: actTaskId });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("done");

    const activity = await prisma.activity.findFirst({
      where: { taskId: actTaskId, type: "task_completed" },
    });
    expect(activity).not.toBeNull();
    expect(activity!.message).toContain("done");
  });

  it("status change from inbox→done logged with correct from/to statuses", async () => {
    const activity = await prisma.activity.findFirst({
      where: { taskId: actTaskId, type: "task_completed" },
    });
    expect(activity!.message).toContain("inbox");
    expect(activity!.message).toContain("done");
  });

  it("queue item creation generates task_updated activity", async () => {
    agentCache.clear();
    const req = buildRequest("POST", "/api/queue", {
      apiKey: rexApiKey,
      body: {
        title: "Activity test queue item",
        description: "Verify queue activities",
        itemType: "action",
      },
    });
    const res = await callRoute(createQueueItem, req);
    expect(res.status).toBe(201);
    const item = await res.json();

    const activity = await prisma.activity.findFirst({
      where: {
        type: "task_updated",
        message: { contains: "added queue item" },
      },
      orderBy: { createdAt: "desc" },
    });
    expect(activity).not.toBeNull();
    expect(activity!.message).toContain("Activity test queue item");

    // Cleanup queue item
    await callRoute(
      deleteQueueItem,
      buildRequest("DELETE", `/api/queue/${item.id}`, { apiKey: rexApiKey }),
      { id: item.id },
    );
  });

  it("queue item status change generates task_updated activity", async () => {
    // Create a queue item, move to in_progress, check activity
    agentCache.clear();
    const createRes = await callRoute(
      createQueueItem,
      buildRequest("POST", "/api/queue", {
        apiKey: rexApiKey,
        body: { title: "Queue status activity test", itemType: "action" },
      }),
    );
    const item = await createRes.json();

    const patchReq = buildRequest("PATCH", `/api/queue/${item.id}`, {
      apiKey: rexApiKey,
      body: { status: "in_progress" },
    });
    const patchRes = await callRoute(updateQueueItem, patchReq, { id: item.id });
    expect(patchRes.status).toBe(200);

    const activity = await prisma.activity.findFirst({
      where: {
        type: "task_updated",
        message: { contains: "in_progress" },
      },
      orderBy: { createdAt: "desc" },
    });
    expect(activity).not.toBeNull();
    expect(activity!.message).toContain("Queue status activity test");

    // Cleanup
    await callRoute(
      deleteQueueItem,
      buildRequest("DELETE", `/api/queue/${item.id}`, { apiKey: rexApiKey }),
      { id: item.id },
    );
  });

  it("subscribers (non-sender) get comment notification", async () => {
    // Rex is subscribed (creator). Assign Nova so she's subscribed too.
    subscriberCache.clear();
    // Create a fresh task with Rex as assignee
    const createRes = await callRoute(
      createTaskHandler,
      buildRequest("POST", "/api/tasks", {
        apiKey: rexApiKey,
        body: {
          title: "Subscriber notification test",
          description: "Testing subscriber comment notifications",
          assigneeIds: [rexAgentId, novaAgentId],
        },
      }),
    );
    const subTaskId = (await createRes.json()).id;

    // Nova posts a message — Rex (subscriber, not sender) should be notified
    subscriberCache.clear();
    await callRoute(
      createMessage,
      buildRequest("POST", `/api/tasks/${subTaskId}/messages`, {
        apiKey: novaApiKey,
        body: { content: "Subscriber notification check" },
      }),
      { id: subTaskId },
    );

    const req = buildRequest("GET", "/api/notifications", { apiKey: rexApiKey });
    const res = await callRoute(listNotifications, req);
    const data = await res.json();
    const commentNotif = data.find(
      (n: any) => n.taskId === subTaskId && n.content?.includes("commented"),
    );
    expect(commentNotif).toBeDefined();
    expect(commentNotif.content).toContain("Nova");

    // Cleanup
    await callRoute(
      deleteTask,
      buildRequest("DELETE", `/api/tasks/${subTaskId}`, { apiKey: rexApiKey }),
      { id: subTaskId },
    );
  });

  it("cleanup: delete activity test task", async () => {
    const req = buildRequest("DELETE", `/api/tasks/${actTaskId}`, { apiKey: rexApiKey });
    const res = await callRoute(deleteTask, req, { id: actTaskId });
    expect(res.status).toBe(200);
  });
});

// ════════════════════════════════════════════════════════════════════
// F. TASK FIELD COVERAGE
// ════════════════════════════════════════════════════════════════════
//
// Tests task fields not exercised elsewhere: dueDate, tags, priority
// "urgent", parentTaskId, blockedByTaskId, all task statuses, and
// list filtering by assigneeId / comma-separated status.

describe("F. Task Field Coverage", () => {
  let fieldTaskId: string;
  let childTaskId: string;
  let blockerTaskId: string;

  it("creates task with 'urgent' priority", async () => {
    const req = buildRequest("POST", "/api/tasks", {
      apiKey: rexApiKey,
      body: {
        title: "Urgent field test",
        description: "Testing urgent priority",
        priority: "urgent",
      },
    });
    const res = await callRoute(createTaskHandler, req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.priority).toBe("urgent");
    fieldTaskId = data.id;
  });

  it("creates task with dueDate and returns it in response", async () => {
    const req = buildRequest("POST", "/api/tasks", {
      apiKey: rexApiKey,
      body: {
        title: "Task with due date",
        description: "Testing dueDate field",
        dueDate: "2026-12-31T00:00:00.000Z",
      },
    });
    const res = await callRoute(createTaskHandler, req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.dueDate).toBeTruthy();
    expect(new Date(data.dueDate).getFullYear()).toBe(2026);

    // Cleanup
    await callRoute(
      deleteTask,
      buildRequest("DELETE", `/api/tasks/${data.id}`, { apiKey: rexApiKey }),
      { id: data.id },
    );
  });

  it("creates task with tags array", async () => {
    const req = buildRequest("POST", "/api/tasks", {
      apiKey: rexApiKey,
      body: {
        title: "Task with tags",
        description: "Testing tags field",
        tags: ["frontend", "urgent", "redesign"],
      },
    });
    const res = await callRoute(createTaskHandler, req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.tags).toEqual(expect.arrayContaining(["frontend", "urgent", "redesign"]));

    // Cleanup
    await callRoute(
      deleteTask,
      buildRequest("DELETE", `/api/tasks/${data.id}`, { apiKey: rexApiKey }),
      { id: data.id },
    );
  });

  it("PATCH updates tags on existing task", async () => {
    const req = buildRequest("PATCH", `/api/tasks/${fieldTaskId}`, {
      apiKey: rexApiKey,
      body: { tags: ["backend", "api"] },
    });
    const res = await callRoute(updateTask, req, { id: fieldTaskId });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tags).toEqual(expect.arrayContaining(["backend", "api"]));
  });

  it("PATCH sets dueDate on existing task", async () => {
    const req = buildRequest("PATCH", `/api/tasks/${fieldTaskId}`, {
      apiKey: rexApiKey,
      body: { dueDate: "2026-06-15T00:00:00.000Z" },
    });
    const res = await callRoute(updateTask, req, { id: fieldTaskId });
    expect(res.status).toBe(200);
    expect((await res.json()).dueDate).toBeTruthy();
  });

  it("creates child task with parentTaskId", async () => {
    const req = buildRequest("POST", "/api/tasks", {
      apiKey: rexApiKey,
      body: {
        title: "Child subtask",
        description: "Testing parentTaskId field",
        parentTaskId: fieldTaskId,
      },
    });
    const res = await callRoute(createTaskHandler, req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.parentTaskId).toBe(fieldTaskId);
    childTaskId = data.id;
  });

  it("GraphQL childTasks query returns the subtask", async () => {
    const result = await runGraphQL(
      `query ChildTasks($parentTaskId: String!) {
        childTasks(parentTaskId: $parentTaskId) { id title parentTaskId }
      }`,
      { parentTaskId: fieldTaskId },
    );
    expect(result.errors).toBeFalsy();
    const children = result.data?.childTasks as any[];
    expect(children.some((c: any) => c.id === childTaskId)).toBe(true);
  });

  it("creates task with blockedByTaskId", async () => {
    const req = buildRequest("POST", "/api/tasks", {
      apiKey: rexApiKey,
      body: {
        title: "Blocked task",
        description: "Testing blockedByTaskId field",
        blockedByTaskId: fieldTaskId,
      },
    });
    const res = await callRoute(createTaskHandler, req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.blockedByTaskId).toBe(fieldTaskId);
    blockerTaskId = data.id;
  });

  it("can move task to 'assigned' status", async () => {
    const req = buildRequest("PATCH", `/api/tasks/${fieldTaskId}`, {
      apiKey: rexApiKey,
      body: { status: "assigned" },
    });
    const res = await callRoute(updateTask, req, { id: fieldTaskId });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("assigned");
  });

  it("can move task to 'blocked' status", async () => {
    const req = buildRequest("PATCH", `/api/tasks/${fieldTaskId}`, {
      apiKey: rexApiKey,
      body: { status: "blocked" },
    });
    const res = await callRoute(updateTask, req, { id: fieldTaskId });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("blocked");
  });

  it("board shows task in 'blocked' column", async () => {
    projectIdsCache.clear();
    memberCache.clear();
    const req = buildRequest("GET", "/api/tasks/board", { apiKey: kiaApiKey });
    const res = await callRoute(getBoard, req);
    expect(res.status).toBe(200);
    const board = await res.json();
    expect(board.blocked.some((t: any) => t.id === fieldTaskId)).toBe(true);
  });

  it("can move task to 'review' status", async () => {
    const req = buildRequest("PATCH", `/api/tasks/${fieldTaskId}`, {
      apiKey: rexApiKey,
      body: { status: "review" },
    });
    const res = await callRoute(updateTask, req, { id: fieldTaskId });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("review");
  });

  it("GET /api/tasks?status=inbox,review returns tasks in either status (comma filter)", async () => {
    const req = buildRequest("GET", "/api/tasks?status=inbox,review", { apiKey: rexApiKey });
    const res = await callRoute(listTasks, req);
    expect(res.status).toBe(200);
    const data = await res.json();
    for (const t of data) {
      expect(["inbox", "review"]).toContain(t.status);
    }
    // Our review task should be in the list
    expect(data.some((t: any) => t.id === fieldTaskId)).toBe(true);
  });

  it("GraphQL taskByNumber query returns task by sequential number", async () => {
    // Get the taskNumber first
    const taskRes = await callRoute(
      getTask,
      buildRequest("GET", `/api/tasks/${fieldTaskId}`, { apiKey: rexApiKey }),
      { id: fieldTaskId },
    );
    const taskNumber = (await taskRes.json()).taskNumber;

    const result = await runGraphQL(
      `query TaskByNumber($taskNumber: Int!) {
        taskByNumber(taskNumber: $taskNumber) { id title taskNumber }
      }`,
      { taskNumber },
    );
    expect(result.errors).toBeFalsy();
    expect(result.data?.taskByNumber?.id).toBe(fieldTaskId);
  });

  it("GraphQL taskCountsByStatus returns counts grouped by status", async () => {
    const result = await runGraphQL(`query { taskCountsByStatus { status count } }`);
    expect(result.errors).toBeFalsy();
    const counts = result.data?.taskCountsByStatus as any[];
    expect(counts.length).toBeGreaterThan(0);
    expect(counts[0]).toHaveProperty("status");
    expect(counts[0]).toHaveProperty("count");
  });

  it("cleanup: delete field test tasks", async () => {
    for (const id of [childTaskId, blockerTaskId, fieldTaskId]) {
      await callRoute(
        deleteTask,
        buildRequest("DELETE", `/api/tasks/${id}`, { apiKey: rexApiKey }),
        { id },
      );
    }
  });
});

// ════════════════════════════════════════════════════════════════════
// G. PENDING REVIEW, EVENTS INGEST & ADDITIONAL ROUTES
// ════════════════════════════════════════════════════════════════════
//
// Tests untested routes: pending-review, events/ingest, health,
// auth/status, project context, agent key regeneration, and
// queue "skipped" status.

describe("G. Pending Review, Events Ingest & Additional Routes", () => {
  let reviewTaskId: string;

  // ── Health & Auth Status ──────────────────────────────────────

  it("GET /api/health returns { status: 'healthy' }", async () => {
    const res = await getHealth();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("healthy");
  });

  it("GET /api/auth/status returns { setupComplete: true }", async () => {
    const res = await getAuthStatus();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.setupComplete).toBe(true);
  });

  // ── Pending Review ────────────────────────────────────────────

  it("creates task and moves to review for pending-review test", async () => {
    subscriberCache.clear();
    const createRes = await callRoute(
      createTaskHandler,
      buildRequest("POST", "/api/tasks", {
        apiKey: rexApiKey,
        body: {
          title: "Pending review route test",
          description: "Testing GET /api/tasks/pending-review",
          projectId,
          assigneeIds: [rexAgentId],
        },
      }),
    );
    reviewTaskId = (await createRes.json()).id;

    const patchRes = await callRoute(
      updateTask,
      buildRequest("PATCH", `/api/tasks/${reviewTaskId}`, {
        apiKey: rexApiKey,
        body: { status: "review" },
      }),
      { id: reviewTaskId },
    );
    expect(patchRes.status).toBe(200);
  });

  it("GET /api/tasks/pending-review returns tasks in review status", async () => {
    memberCache.clear();
    projectIdsCache.clear();
    const req = buildRequest("GET", "/api/tasks/pending-review", { apiKey: kiaApiKey });
    const res = await callRoute(getPendingReview, req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.some((t: any) => t.id === reviewTaskId)).toBe(true);

    // Includes assignees and recent messages in response
    const reviewTask = data.find((t: any) => t.id === reviewTaskId);
    expect(reviewTask.assignees).toBeDefined();
  });

  it("GET /api/tasks/pending-review without auth — 401", async () => {
    const req = buildRequest("GET", "/api/tasks/pending-review");
    const res = await callRoute(getPendingReview, req);
    expect(res.status).toBe(401);
  });

  it("approving task without child tasks returns null childTaskIds", async () => {
    const req = buildRequest("POST", `/api/tasks/${reviewTaskId}/approve`, {
      apiKey: kiaApiKey,
      body: { approvalComment: "Looks good, no follow-ups needed" },
    });
    const res = await callRoute(approveTask, req, { id: reviewTaskId });
    expect(res.status).toBe(200);
    const data = await res.json();
    // No childTasks requested, so should be null/undefined
    expect(data.childTaskIds ?? null).toBeNull();

    // Task should be done now
    const taskReq = buildRequest("GET", `/api/tasks/${reviewTaskId}`, { apiKey: rexApiKey });
    const taskRes = await callRoute(getTask, taskReq, { id: reviewTaskId });
    expect((await taskRes.json()).status).toBe(TaskStatus.DONE);
  });

  // ── Project Context ───────────────────────────────────────────

  it("GET /api/projects/:id/context returns project with docs", async () => {
    const req = buildRequest("GET", `/api/projects/${projectId}/context`, { apiKey: rexApiKey });
    const res = await callRoute(getProjectContext, req, { id: projectId });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.id).toBe(projectId);
    expect(data.name).toBe("Website Redesign");
    expect(data.description).toBeTruthy();
    expect(data.projectDocs).toBeDefined();
  });

  it("GET /api/projects/:id/context for nonexistent project — 404", async () => {
    const req = buildRequest("GET", "/api/projects/nonexistent/context", { apiKey: rexApiKey });
    const res = await callRoute(getProjectContext, req, { id: "nonexistent" });
    expect(res.status).toBe(404);
  });

  // ── Events Ingest ─────────────────────────────────────────────

  it("POST /api/events/ingest without auth — 401", async () => {
    const req = buildRequest("POST", "/api/events/ingest", {
      body: { type: "agent.heartbeat" },
    });
    const res = await ingestEvent(req);
    expect(res.status).toBe(401);
  });

  it("POST /api/events/ingest with valid API key and agent.heartbeat", async () => {
    const req = buildRequest("POST", "/api/events/ingest", {
      apiKey: rexApiKey,
      body: { type: "agent.heartbeat" },
    });
    const res = await ingestEvent(req);
    expect(res.status).toBe(200);
  });

  it("POST /api/events/ingest missing event.type — 400", async () => {
    const req = buildRequest("POST", "/api/events/ingest", {
      apiKey: rexApiKey,
      body: {},
    });
    const res = await ingestEvent(req);
    expect(res.status).toBe(400);
  });

  // ── Agent Key Regeneration ────────────────────────────────────

  it("regenerating API key returns new key and invalidates old", async () => {
    // Create a temporary agent for this test
    const createRes = await callRoute(
      createAgent,
      buildRequest("POST", "/api/agents/create", {
        body: { name: "KeyRegenTest", role: "Tester", username: "keyregen-test" },
      }),
    );
    const { agent: tempAgent, apiKey: oldKey } = await createRes.json();

    // Activate the agent
    await prisma.agent.update({
      where: { id: tempAgent.id },
      data: { setupStatus: SetupStatus.ACTIVE },
    });
    agentCache.clear();

    // Verify old key works
    const meReq = buildRequest("GET", "/api/agents/me", { apiKey: oldKey });
    const meRes = await callRoute(getMe, meReq);
    expect(meRes.status).toBe(200);

    // Regenerate
    const regenReq = buildRequest("POST", `/api/agents/${tempAgent.id}/regenerate-key`);
    const regenRes = await callRoute(regenerateKey, regenReq, { id: tempAgent.id });
    expect(regenRes.status).toBe(200);
    const regenData = await regenRes.json();
    expect(regenData.apiKey).toMatch(/^mc_/);
    expect(regenData.apiKey).not.toBe(oldKey);

    agentCache.clear();

    // Old key should no longer work
    const oldMeReq = buildRequest("GET", "/api/agents/me", { apiKey: oldKey });
    const oldMeRes = await callRoute(getMe, oldMeReq);
    expect(oldMeRes.status).toBe(401);

    // New key should work
    const newMeReq = buildRequest("GET", "/api/agents/me", { apiKey: regenData.apiKey });
    const newMeRes = await callRoute(getMe, newMeReq);
    expect(newMeRes.status).toBe(200);
    expect((await newMeRes.json()).name).toBe("KeyRegenTest");
  });

  it("regenerate key for nonexistent agent — 404", async () => {
    const req = buildRequest("POST", "/api/agents/nonexistent/regenerate-key");
    const res = await callRoute(regenerateKey, req, { id: "nonexistent" });
    expect(res.status).toBe(404);
  });

  // ── Queue: Skipped Status ─────────────────────────────────────

  it("queue item can be moved to 'skipped' with completedAt set", async () => {
    agentCache.clear();
    const createRes = await callRoute(
      createQueueItem,
      buildRequest("POST", "/api/queue", {
        apiKey: rexApiKey,
        body: { title: "Skippable item", itemType: "action" },
      }),
    );
    expect(createRes.status).toBe(201);
    const item = await createRes.json();

    const patchReq = buildRequest("PATCH", `/api/queue/${item.id}`, {
      apiKey: rexApiKey,
      body: { status: "skipped" },
    });
    const patchRes = await callRoute(updateQueueItem, patchReq, { id: item.id });
    expect(patchRes.status).toBe(200);
    const updated = await patchRes.json();
    expect(updated.status).toBe("skipped");
    expect(updated.completedAt).toBeTruthy();

    // Cleanup
    await callRoute(
      deleteQueueItem,
      buildRequest("DELETE", `/api/queue/${item.id}`, { apiKey: rexApiKey }),
      { id: item.id },
    );
  });

  it("second PATCH to in_progress does not overwrite startedAt", async () => {
    agentCache.clear();
    const createRes = await callRoute(
      createQueueItem,
      buildRequest("POST", "/api/queue", {
        apiKey: rexApiKey,
        body: { title: "StartedAt test", itemType: "action" },
      }),
    );
    const item = await createRes.json();

    // Move to in_progress first time
    const firstPatch = await callRoute(
      updateQueueItem,
      buildRequest("PATCH", `/api/queue/${item.id}`, {
        apiKey: rexApiKey,
        body: { status: "in_progress" },
      }),
      { id: item.id },
    );
    const firstStartedAt = (await firstPatch.json()).startedAt;
    expect(firstStartedAt).toBeTruthy();

    // Move back to pending, then in_progress again
    await callRoute(
      updateQueueItem,
      buildRequest("PATCH", `/api/queue/${item.id}`, {
        apiKey: rexApiKey,
        body: { status: QueueItemStatus.PENDING },
      }),
      { id: item.id },
    );

    const secondPatch = await callRoute(
      updateQueueItem,
      buildRequest("PATCH", `/api/queue/${item.id}`, {
        apiKey: rexApiKey,
        body: { status: "in_progress" },
      }),
      { id: item.id },
    );
    const secondStartedAt = (await secondPatch.json()).startedAt;
    // Should be same value — not overwritten
    expect(secondStartedAt).toBe(firstStartedAt);

    // Cleanup
    await callRoute(
      deleteQueueItem,
      buildRequest("DELETE", `/api/queue/${item.id}`, { apiKey: rexApiKey }),
      { id: item.id },
    );
  });

  // ── Board: Non-member access ──────────────────────────────────

  it("board filtered by project returns 403 for non-member", async () => {
    memberCache.clear();
    projectIdsCache.clear();
    const req = buildRequest("GET", `/api/tasks/board?projectId=${projectId}`, {
      apiKey: sageApiKey,
    });
    const res = await callRoute(getBoard, req);
    // Sage is not a member of the project
    expect(res.status).toBe(403);
  });

  // ── Cleanup ───────────────────────────────────────────────────

  it("cleanup: delete review task", async () => {
    const req = buildRequest("DELETE", `/api/tasks/${reviewTaskId}`, { apiKey: kiaApiKey });
    const res = await callRoute(deleteTask, req, { id: reviewTaskId });
    expect(res.status).toBe(200);
  });
});

// ════════════════════════════════════════════════════════════════════
// H. EXTENDED GRAPHQL COVERAGE
// ════════════════════════════════════════════════════════════════════
//
// Tests GraphQL queries and mutations not covered elsewhere:
// activitiesByTask, deliverableVersions, deleteDeliverable,
// notification queries, and additional task queries.

describe("H. Extended GraphQL Coverage", () => {
  let gqlTaskId: string;
  let gqlDeliverableId: string;

  it("creates task for GraphQL testing", async () => {
    subscriberCache.clear();
    const req = buildRequest("POST", "/api/tasks", {
      apiKey: rexApiKey,
      body: {
        title: "GraphQL coverage task",
        description: "Testing extended GraphQL operations",
        assigneeIds: [rexAgentId],
      },
    });
    const res = await callRoute(createTaskHandler, req);
    expect(res.status).toBe(201);
    gqlTaskId = (await res.json()).id;
  });

  it("GraphQL task query returns single task by id", async () => {
    const result = await runGraphQL(
      `query GetTask($id: String!) { task(id: $id) { id title status } }`,
      { id: gqlTaskId },
    );
    expect(result.errors).toBeFalsy();
    expect(result.data?.task.title).toBe("GraphQL coverage task");
  });

  it("GraphQL activitiesByTask returns activity entries", async () => {
    const result = await runGraphQL(
      `query Activities($taskId: String!) {
        activitiesByTask(taskId: $taskId) { id type message }
      }`,
      { taskId: gqlTaskId },
    );
    expect(result.errors).toBeFalsy();
    const activities = result.data?.activitiesByTask as any[];
    expect(activities.length).toBeGreaterThan(0);
    expect(activities.some((a: any) => a.type === "task_created")).toBe(true);
  });

  it("GraphQL tasksByAssignee returns assigned tasks", async () => {
    const result = await runGraphQL(
      `query TasksByAssignee($agentId: String!) {
        tasksByAssignee(agentId: $agentId) { id title }
      }`,
      { agentId: rexAgentId },
    );
    expect(result.errors).toBeFalsy();
    const tasks = result.data?.tasksByAssignee as any[];
    expect(tasks.some((t: any) => t.id === gqlTaskId)).toBe(true);
  });

  it("Rex submits deliverable for version history testing", async () => {
    const req = buildRequest("POST", `/api/tasks/${gqlTaskId}/deliverables`, {
      apiKey: rexApiKey,
      body: {
        title: "GraphQL Deliverable v1",
        kind: "markdown",
        content: "# Version 1\n\nInitial content.",
      },
    });
    const res = await callRoute(createDeliverable, req, { id: gqlTaskId });
    expect(res.status).toBe(201);
    gqlDeliverableId = (await res.json()).id;
  });

  it("Rex updates deliverable to create version 2", async () => {
    const req = buildRequest("PATCH", `/api/tasks/${gqlTaskId}/deliverables/${gqlDeliverableId}`, {
      apiKey: rexApiKey,
      body: { title: "GraphQL Deliverable v2", content: "# Version 2\n\nUpdated content." },
    });
    const res = await callRoute(updateDeliverable, req, {
      id: gqlTaskId,
      deliverableId: gqlDeliverableId,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).version).toBe(2);
  });

  it("GraphQL deliverableVersions returns version history", async () => {
    const result = await runGraphQL(
      `query Versions($deliverableId: String!) {
        deliverableVersions(deliverableId: $deliverableId) { id version title content }
      }`,
      { deliverableId: gqlDeliverableId },
    );
    expect(result.errors).toBeFalsy();
    const versions = result.data?.deliverableVersions as any[];
    expect(versions.length).toBeGreaterThanOrEqual(1);
    // Version history should include snapshot of v1
    expect(versions.some((v: any) => v.title === "GraphQL Deliverable v1")).toBe(true);
  });

  it("GraphQL deliverablesByAgent returns deliverables by agent", async () => {
    const result = await runGraphQL(
      `query DelsByAgent($agentId: String!) {
        deliverablesByAgent(agentId: $agentId) { id title taskId }
      }`,
      { agentId: rexAgentId },
    );
    expect(result.errors).toBeFalsy();
    const dels = result.data?.deliverablesByAgent as any[];
    expect(dels.some((d: any) => d.id === gqlDeliverableId)).toBe(true);
  });

  it("GraphQL deleteDeliverable removes the deliverable", async () => {
    const result = await runGraphQL(
      `mutation DeleteDel($id: String!) {
        deleteDeliverable(id: $id)
      }`,
      { id: gqlDeliverableId },
    );
    expect(result.errors).toBeFalsy();
    expect(result.data?.deleteDeliverable).toBe(true);

    // Verify it's gone
    const listRes = await callRoute(
      listDeliverables,
      buildRequest("GET", `/api/tasks/${gqlTaskId}/deliverables`, { apiKey: rexApiKey }),
      { id: gqlTaskId },
    );
    const remaining = await listRes.json();
    expect(remaining.some((d: any) => d.id === gqlDeliverableId)).toBe(false);
  });

  it("GraphQL undeliveredNotifications returns unread notifications", async () => {
    const result = await runGraphQL(
      `query { undeliveredNotifications { id content delivered taskId } }`,
    );
    expect(result.errors).toBeFalsy();
    const notifs = result.data?.undeliveredNotifications as any[];
    expect(notifs).toBeDefined();
    // All should be undelivered
    for (const n of notifs) {
      expect(n.delivered).toBe(false);
    }
  });

  it("GraphQL notificationsByAgent returns notifications for specific agent", async () => {
    const result = await runGraphQL(
      `query NotifsByAgent($agentId: String!) {
        notificationsByAgent(agentId: $agentId, includeDelivered: true) { id content delivered }
      }`,
      { agentId: rexAgentId },
    );
    expect(result.errors).toBeFalsy();
    const notifs = result.data?.notificationsByAgent as any[];
    expect(notifs).toBeDefined();
  });

  it("GraphQL markManyNotificationsDelivered batch-marks notifications", async () => {
    // Get Rex's undelivered notification IDs
    const listResult = await runGraphQL(
      `query { notificationsByAgent(agentId: "${rexAgentId}") { id } }`,
    );
    const ids = ((listResult.data?.notificationsByAgent as any[]) ?? []).map((n: any) => n.id);

    if (ids.length > 0) {
      const result = await runGraphQL(
        `mutation MarkMany($ids: [String!]!) {
          markManyNotificationsDelivered(ids: $ids)
        }`,
        { ids },
      );
      expect(result.errors).toBeFalsy();
      expect(result.data?.markManyNotificationsDelivered).toBe(ids.length);
    }
  });

  it("GraphQL agents query returns all agents", async () => {
    const result = await runGraphQL(`query { agents { id name role username } }`);
    expect(result.errors).toBeFalsy();
    const agents = result.data?.agents as any[];
    expect(agents.length).toBeGreaterThanOrEqual(4); // Rex, Nova, Kia, Sage
    expect(agents.some((a: any) => a.name === "Rex")).toBe(true);
    expect(agents.some((a: any) => a.name === "Nova")).toBe(true);
  });

  it("GraphQL projects query returns projects", async () => {
    const result = await runGraphQL(`query { projects { id name description } }`);
    expect(result.errors).toBeFalsy();
    const projects = result.data?.projects as any[];
    expect(projects.some((p: any) => p.id === projectId)).toBe(true);
  });

  it("GraphQL projectsByAgent returns projects for an agent", async () => {
    const result = await runGraphQL(
      `query ProjectsByAgent($agentId: String!) {
        projectsByAgent(agentId: $agentId) { id name }
      }`,
      { agentId: rexAgentId },
    );
    expect(result.errors).toBeFalsy();
    const projects = result.data?.projectsByAgent as any[];
    expect(projects.some((p: any) => p.id === projectId)).toBe(true);
  });

  it("cleanup: delete GraphQL test task", async () => {
    const req = buildRequest("DELETE", `/api/tasks/${gqlTaskId}`, { apiKey: rexApiKey });
    const res = await callRoute(deleteTask, req, { id: gqlTaskId });
    expect(res.status).toBe(200);
  });
});

// ════════════════════════════════════════════════════════════════════
// 15. TASK DELETION & CLEANUP
// ════════════════════════════════════════════════════════════════════

describe("15. Task Deletion & Cleanup", () => {
  it("returns 404 for nonexistent task", async () => {
    const req = buildRequest("DELETE", "/api/tasks/nonexistent", { apiKey: rexApiKey });
    const res = await callRoute(deleteTask, req, { id: "nonexistent" });
    expect(res.status).toBe(404);
  });

  it("Rex deletes the task", async () => {
    const req = buildRequest("DELETE", `/api/tasks/${taskId}`, { apiKey: rexApiKey });
    const res = await callRoute(deleteTask, req, { id: taskId });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("deleted task no longer appears in task list", async () => {
    const req = buildRequest("GET", "/api/tasks", { apiKey: rexApiKey });
    const res = await callRoute(listTasks, req);
    const data = await res.json();
    expect(data.some((t: any) => t.id === taskId)).toBe(false);
  });

  it("deletion logged in activity feed", async () => {
    // Soft delete preserves the task row, so activities survive
    const activity = await prisma.activity.findFirst({
      where: {
        taskId,
        type: "task_updated",
        message: { contains: "deleted" },
      },
    });
    expect(activity).not.toBeNull();
    expect(activity!.message).toMatch(/deleted/i);
  });

  it("task is actually gone", async () => {
    const req = buildRequest("GET", `/api/tasks/${taskId}`, { apiKey: rexApiKey });
    const res = await callRoute(getTask, req, { id: taskId });
    expect(res.status).toBe(404);
  });

  it("deliverables and messages preserved after soft delete", async () => {
    // Soft delete keeps related data intact in DB
    const deliverables = await prisma.deliverable.findMany({ where: { taskId } });
    const messages = await prisma.message.findMany({ where: { taskId } });

    expect(deliverables.length).toBeGreaterThan(0);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("deleted task does not appear on board", async () => {
    const req = buildRequest("GET", "/api/tasks/board", { apiKey: kiaApiKey });
    const res = await callRoute(getBoard, req);
    const board = await res.json();

    // The deleted task should not be in any column
    for (const tasks of Object.values(board) as any[][]) {
      expect(tasks.some((t: any) => t.id === taskId)).toBe(false);
    }
  });
});

// ════════════════════════════════════════════════════════════════════
// 16. SETUP RATE LIMITING
// ════════════════════════════════════════════════════════════════════

describe("16. Setup Rate Limiting", () => {
  it("rate limits setup attempts after 3 from same IP", async () => {
    const setupIp = "10.88.88.88";

    // 3 attempts (all fail because admin already exists, but they count)
    for (let i = 0; i < 3; i++) {
      await adminSetup("hacker", "password123", setupIp);
    }

    // 4th attempt should be rate limited
    const res = await adminSetup("hacker", "password123", setupIp);
    expect(res.status).toBe(429);

    const data = await res.json();
    expect(data.error).toMatch(/too many/i);
  });
});
