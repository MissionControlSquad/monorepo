import { NextResponse } from "next/server";
import { prisma } from "../src/server/prisma";
import { generateApiKey } from "../src/server/api-key";
import { ensureUserAndProfileForAdmin } from "@agentcenter/database";
import type { Agent, Task, Project } from "@agentcenter/database";
import { AgentStatus, SetupStatus, TaskStatus } from "../src/server/constants";
import { COOKIE_NAME, getSessionCookieOptions, createSessionToken } from "../src/server/admin-auth";

// ─── Admin Auth Helpers ────────────────────────────────────────────
//
// Production/dev auth is buildbase-only (there is no password login route). Tests can't run a real
// buildbase OAuth flow, so these helpers establish an app session by minting an mc_session IN-PROCESS
// via the test-only, env-gated `mintTestSessionToken`. Signatures are unchanged so call sites don't
// churn; the `password` arg is now ignored (kept for source compatibility).

/**
 * Ensure a local AdminUser + User + Profile exist for `username` and return them. Mirrors what the
 * removed setup route used to persist, so downstream code that expects an owner/AdminUser still works.
 */
async function ensureTestAdmin(username: string) {
  const normalized = username.trim().toLowerCase();
  let admin = await prisma.adminUser.findUnique({ where: { username: normalized } });
  if (!admin) {
    admin = await prisma.adminUser.create({
      data: { username: normalized, passwordHash: "test-only-no-login" },
    });
  }
  const { profileId } = await ensureUserAndProfileForAdmin(admin.id, admin.username);
  return { admin, profileId };
}

/**
 * Build a Response carrying the mc_session cookie (so extractSessionCookie keeps working). Mints via
 * the core createSessionToken primitive — this is test-only source (never shipped), so it does not go
 * through the env-gated mintTestSessionToken (that gate protects the HTTP /api/test/session route).
 */
async function sessionResponse(adminId: string, username: string, profileId: string) {
  const token = await createSessionToken({ sub: adminId, username, profileId });
  const res = NextResponse.json({ success: true, username, profileId });
  res.cookies.set(COOKIE_NAME, token, getSessionCookieOptions());
  return res;
}

/**
 * Establish the first admin account + session (idempotent). Replaces the deleted password-setup route.
 * `_password` is ignored.
 */
export async function adminSetup(username: string, _password?: string, _ip = "10.0.0.1") {
  const { admin, profileId } = await ensureTestAdmin(username);
  return sessionResponse(admin.id, admin.username, profileId);
}

/**
 * Establish a session for an existing (or newly-ensured) admin. Replaces the deleted password-login
 * route. `_password` is ignored.
 */
export async function adminLogin(username: string, _password?: string, _ip = "10.0.0.1") {
  const { admin, profileId } = await ensureTestAdmin(username);
  return sessionResponse(admin.id, admin.username, profileId);
}

/**
 * Call the logout route.
 */
export async function adminLogout() {
  const { POST } = await import("../app/api/auth/logout/route");
  return POST();
}

/**
 * Extract the mc_session cookie value from a NextResponse.
 */
export function extractSessionCookie(response: Response): string | null {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) return null;
  const match = setCookie.match(/mc_session=([^;]+)/);
  return match ? match[1] : null;
}

// ─── Agent Helpers ─────────────────────────────────────────────────

/**
 * Create a test agent directly in the DB with a known API key.
 * Use this when you don't need to go through the admin create flow.
 */
export async function createTestAgent(
  overrides: Partial<{
    name: string;
    role: string;
    username: string;
    setupStatus: string;
    status: string;
  }> = {},
): Promise<{ agent: Agent; apiKey: string }> {
  const { plainKey, hash, prefix } = generateApiKey();

  const agent = await prisma.agent.create({
    data: {
      name: overrides.name ?? "Test Agent",
      role: overrides.role ?? "Developer",
      username: overrides.username ?? `test-${hash.slice(0, 8)}`,
      status: (overrides.status as any) ?? AgentStatus.IDLE,
      setupStatus: (overrides.setupStatus as any) ?? SetupStatus.ACTIVE,
      apiKeyHash: hash,
      apiKeyPrefix: prefix,
    },
  });

  return { agent, apiKey: plainKey };
}

/**
 * Create a test task in the database.
 */
export async function createTestTask(
  agentId: string,
  overrides: Partial<{
    title: string;
    description: string;
    status: string;
    projectId: string;
  }> = {},
): Promise<Task> {
  // Resolve agent to profile for createdByProfileId
  let profile = await prisma.profile.findFirst({ where: { agentId } });
  if (!profile) {
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    profile = await prisma.profile.create({
      data: {
        kind: "agent",
        agentId,
        displayName: agent?.name ?? "Test Agent",
        username: agent?.username ?? agentId,
      },
    });
  }
  return prisma.task.create({
    data: {
      title: overrides.title ?? "Test Task",
      description: overrides.description ?? "Test task description",
      status: (overrides.status as any) ?? TaskStatus.INBOX,
      createdByProfileId: profile.id,
      projectId: overrides.projectId ?? undefined,
    },
  });
}

/**
 * Create a test project.
 */
export async function createTestProject(
  overrides: Partial<{ name: string; description: string }> = {},
): Promise<Project> {
  return prisma.project.create({
    data: {
      name: overrides.name ?? "Test Project",
      description: overrides.description ?? "Test project description",
    },
  });
}

/**
 * Add an agent as an active member of a project.
 */
export async function addProjectMember(projectId: string, agentId: string) {
  // Resolve agent to profile for profileId
  let profile = await prisma.profile.findFirst({ where: { agentId } });
  if (!profile) {
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    profile = await prisma.profile.create({
      data: {
        kind: "agent",
        agentId,
        displayName: agent?.name ?? "Test Agent",
        username: agent?.username ?? agentId,
      },
    });
  }
  return prisma.projectMember.create({
    data: { projectId, profileId: profile.id, status: "active" },
  });
}

// ─── Request / Route Helpers ───────────────────────────────────────

/**
 * Build a Request object for Next.js route handlers.
 */
export function buildRequest(
  method: string,
  url: string,
  options: {
    apiKey?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Request {
  const headers = new Headers(options.headers);
  if (options.apiKey) {
    headers.set("Authorization", `Bearer ${options.apiKey}`);
  }
  if (options.body) {
    headers.set("Content-Type", "application/json");
  }
  // Default IP for non-rate-limited tests
  if (!headers.has("x-forwarded-for")) {
    headers.set("x-forwarded-for", "10.0.0.1");
  }

  return new Request(url.startsWith("http") ? url : `http://localhost:3000${url}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

/**
 * Call a Next.js App Router handler with the proper context object.
 */
export async function callRoute(
  handler: (request: Request, ctx?: any) => Promise<Response>,
  request: Request,
  params?: Record<string, string | string[]>,
): Promise<Response> {
  if (params) {
    return handler(request, { params: Promise.resolve(params) });
  }
  return handler(request);
}

// ─── GraphQL Helpers ────────────────────────────────────────────────

/**
 * Execute a GraphQL query/mutation against the app's GraphQL route handler.
 * Optionally pass a session cookie for authenticated dashboard operations.
 */
export async function runGraphQL(
  query: string,
  variables?: Record<string, unknown>,
  cookie?: string,
) {
  const { POST } = await import("../app/api/graphql/route");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) {
    headers["cookie"] = `mc_session=${cookie}`;
  }
  const req = new Request("http://test/api/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
  const res = await POST(req);
  const text = await res.text();
  if (!text) return { data: undefined, errors: [{ message: "Empty response" }] };
  return JSON.parse(text) as { data?: any; errors?: { message: string }[] };
}
