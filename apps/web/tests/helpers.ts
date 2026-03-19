import { prisma } from "../src/server/prisma";
import { generateApiKey } from "../src/server/api-key";
import type { Agent, Task, Project } from "@agentcenter/database";

// ─── Admin Auth Helpers ────────────────────────────────────────────

/**
 * Call the admin setup route to create the first admin account.
 * Returns the response (with session cookie).
 */
export async function adminSetup(username: string, password: string, ip = "10.0.0.1") {
  const { POST } = await import("../app/api/auth/setup/route");
  return POST(
    new Request("http://localhost:3000/api/auth/setup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({ username, password }),
    }),
  );
}

/**
 * Call the login route.
 * Returns the response (with session cookie on success).
 */
export async function adminLogin(username: string, password: string, ip = "10.0.0.1") {
  const { POST } = await import("../app/api/auth/login/route");
  return POST(
    new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({ username, password }),
    }),
  );
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
      status: (overrides.status as any) ?? "idle",
      setupStatus: (overrides.setupStatus as any) ?? "active",
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
      status: (overrides.status as any) ?? "inbox",
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
