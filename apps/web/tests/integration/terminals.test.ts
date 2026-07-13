import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import { invalidateFlagCache } from "../../src/server/feature-flags";
import { activateTerminalSession } from "../../src/server/services/terminals";
import { hashApiKey } from "../../src/server/api-key";

/**
 * Epic #9 terminal sessions — real GraphQL route + Postgres. TERMINALS is off by default; happy-path
 * tests enable it. admin-only, workspace-isolated. No PTY stream — sessions are authorized, not
 * connected. The connect token is returned once at open, stored only hashed.
 */
const SECRET = "term-test-secret";
const WS_A = "ws_term_A";
const WS_B = "ws_term_B";
let humanId = "";

async function gql(query: string, variables?: Record<string, unknown>, cookie?: string) {
  const req = new Request("http://test/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  const res = await POST(req);
  const text = await res.text();
  return text
    ? (JSON.parse(text) as { data?: any; errors?: { message: string }[] })
    : { errors: [{ message: "empty" }] };
}
async function cookieFor(workspaceId: string, role: "admin" | "member") {
  const token = await createJWT({ userId: humanId, workspaceId, userRole: role }, SECRET);
  return `bb-workspace-token=${token}`;
}
async function setTerminals(enabled: boolean) {
  await prisma.featureFlag.upsert({
    where: { key: "terminals" },
    create: { key: "terminals", enabled, managedBy: "user" },
    update: { enabled },
  });
  invalidateFlagCache();
}
const OPEN = `mutation($c:String!,$cwd:String){ openTerminalSession(command:$c, cwd:$cwd){ id host port username connectToken } }`;
const LIST = `query{ terminalSessions{ id host port username status } }`;

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE terminal_sessions, agents, profiles CASCADE`);
  await prisma.featureFlag.deleteMany({ where: { key: "terminals" } });
  invalidateFlagCache();
  const p = await prisma.profile.create({ data: { kind: "human", displayName: "Term Human" } });
  humanId = p.id;
});

describe("open + storage (Epic #9)", () => {
  it("parses the SSH command, persists host/port/username, and mints a hashed token", async () => {
    await setTerminals(true);
    const r = await gql(OPEN, { c: "ssh -p 2222 dev@box.test" }, await cookieFor(WS_A, "admin"));
    expect(r.errors).toBeFalsy();
    const { id, host, port, username, connectToken } = r.data.openTerminalSession;
    expect({ host, port, username }).toEqual({ host: "box.test", port: 2222, username: "dev" });
    expect(connectToken.startsWith("ts_")).toBe(true);
    const row = await prisma.terminalSession.findUniqueOrThrow({ where: { id } });
    expect(row.connectTokenHash).toBe(hashApiKey(connectToken));
    expect(row.status).toBe("pending");
  });

  it("rejects an unsupported SSH command and an unsafe cwd", async () => {
    await setTerminals(true);
    const admin = await cookieFor(WS_A, "admin");
    expect((await gql(OPEN, { c: "ssh dev@box.test -i /key" }, admin)).errors).toBeDefined();
    expect((await gql(OPEN, { c: "ssh dev@box.test", cwd: "/etc" }, admin)).errors).toBeDefined();
    expect(await prisma.terminalSession.count()).toBe(0);
  });

  it("never exposes the token hash through the list query", async () => {
    await setTerminals(true);
    const admin = await cookieFor(WS_A, "admin");
    const tok = (await gql(OPEN, { c: "ssh dev@box.test" }, admin)).data.openTerminalSession
      .connectToken;
    const row = await prisma.terminalSession.findFirstOrThrow({});
    const list = await gql(LIST, undefined, admin);
    const blob = JSON.stringify(list.data.terminalSessions);
    expect(list.data.terminalSessions).toHaveLength(1);
    expect(blob).not.toContain(row.connectTokenHash);
    expect(blob).not.toContain(tok);
  });
});

describe("activate + close (Epic #9)", () => {
  it("activates with the right token, rejects a wrong one, then closes", async () => {
    await setTerminals(true);
    const admin = await cookieFor(WS_A, "admin");
    const opened = (await gql(OPEN, { c: "ssh dev@box.test" }, admin)).data.openTerminalSession;

    await expect(activateTerminalSession(WS_A, opened.id, "ts_wrongtoken")).rejects.toThrow();

    const activated = await activateTerminalSession(WS_A, opened.id, opened.connectToken);
    expect(activated.status).toBe("active");
    expect(activated.lastActivityAt).not.toBeNull();

    const closed = await gql(
      `mutation($id:String!){ closeTerminalSession(id:$id) }`,
      { id: opened.id },
      admin,
    );
    expect(closed.data.closeTerminalSession).toBe(true);
    expect(
      (await prisma.terminalSession.findUniqueOrThrow({ where: { id: opened.id } })).status,
    ).toBe("closed");
  });
});

describe("guards (Epic #9)", () => {
  it("is admin-only — a member cannot open", async () => {
    await setTerminals(true);
    const denied = await gql(OPEN, { c: "ssh dev@box.test" }, await cookieFor(WS_A, "member"));
    expect(denied.errors).toBeDefined();
    expect(await prisma.terminalSession.count()).toBe(0);
  });

  it("is workspace-isolated — WS_A cannot see WS_B's sessions", async () => {
    await setTerminals(true);
    await gql(OPEN, { c: "ssh dev@b.test" }, await cookieFor(WS_B, "admin"));
    const list = await gql(LIST, undefined, await cookieFor(WS_A, "admin"));
    expect(list.data.terminalSessions).toHaveLength(0);
  });

  it("is denied when TERMINALS is off (default)", async () => {
    await setTerminals(false);
    const r = await gql(OPEN, { c: "ssh dev@box.test" }, await cookieFor(WS_A, "admin"));
    expect(r.errors).toBeDefined();
  });
});
