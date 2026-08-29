import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { FLAG_KEYS } from "@agentcenter/utils";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import {
  invalidateFlagCache,
  setTestFeature,
  resetTestFeature,
} from "../../src/server/feature-flags";
import { hashApiKey } from "../../src/server/api-key";
import {
  authenticateBoardPrincipal,
  postBoardMessageAsPrincipal,
  createBoardPrincipal,
} from "../../src/server/services/board-principals";

/**
 * Board principal lifecycle (Paperclip board-authz + board API keys). Real GraphQL route + Postgres.
 * BOARD_CHAT is off by default, so the happy path enables it first. admin-only, workspace-isolated.
 */
const SECRET = "board-principal-secret";
const WS_A = "ws_bp_A";
const WS_B = "ws_bp_B";
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
async function setBoardChat(enabled: boolean) {
  setTestFeature(FLAG_KEYS.BOARD_CHAT, enabled);
  invalidateFlagCache();
}

const CREATE = `mutation($n:String!,$r:String){ createBoardPrincipal(name:$n, role:$r){ id name role keyPrefix plainKey } }`;
const LIST = `query{ boardPrincipals{ id name role keyPrefix revokedAt } }`;
const REVOKE = `mutation($id:String!){ revokeBoardPrincipal(id:$id){ id revokedAt } }`;

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE board_principals, board_threads, api_keys, profiles CASCADE`,
  );
  resetTestFeature(FLAG_KEYS.BOARD_CHAT);
  invalidateFlagCache();
  const p = await prisma.profile.create({ data: { kind: "human", displayName: "BP Human" } });
  humanId = p.id;
});

describe("board principal lifecycle (GraphQL)", () => {
  it("creates a principal, mints a one-time key hashed at rest, lists it, and revokes it", async () => {
    await setBoardChat(true);
    const admin = await cookieFor(WS_A, "admin");

    const created = await gql(CREATE, { n: "Acme Board", r: "chair" }, admin);
    expect(created.errors).toBeFalsy();
    const principal = created.data.createBoardPrincipal;
    expect(principal).toMatchObject({ name: "Acme Board", role: "chair" });
    // The plaintext key is returned exactly once and is prefixed by keyPrefix.
    expect(principal.plainKey).toMatch(/^mc_/);
    expect(principal.plainKey.startsWith(principal.keyPrefix)).toBe(true);

    // Only the HASH is at rest — never the plaintext.
    const key = await prisma.apiKey.findFirstOrThrow({ where: { workspaceId: WS_A } });
    expect(key.keyHash).toBe(hashApiKey(principal.plainKey));
    expect(key.name).toBe("board:Acme Board");
    expect(JSON.stringify(key)).not.toContain(principal.plainKey);

    const listed = await gql(LIST, undefined, admin);
    expect(listed.data.boardPrincipals).toHaveLength(1);
    expect(listed.data.boardPrincipals[0].keyPrefix).toBe(principal.keyPrefix);

    const revoked = await gql(REVOKE, { id: principal.id }, admin);
    expect(revoked.data.revokeBoardPrincipal.revokedAt).toBeTruthy();
    // Revoking the principal also revokes the linked board API key.
    const keyAfter = await prisma.apiKey.findUniqueOrThrow({ where: { id: key.id } });
    expect(keyAfter.revokedAt).toBeTruthy();
  });

  it("defaults role to member and rejects an unknown role", async () => {
    await setBoardChat(true);
    const admin = await cookieFor(WS_A, "admin");
    const ok = await gql(CREATE, { n: "Defaulted" }, admin);
    expect(ok.data.createBoardPrincipal.role).toBe("member");
    const bad = await gql(CREATE, { n: "Bad", r: "wizard" }, admin);
    expect(bad.errors).toBeDefined();
    // The GraphQL boundary masks error messages app-wide; assert the readable reason at the service layer.
    await expect(
      createBoardPrincipal({ workspaceId: WS_A, name: "Bad", role: "wizard" }),
    ).rejects.toThrow(/role must be one of/);
  });
});

describe("board principal guards", () => {
  it("is admin-only — a member cannot create", async () => {
    await setBoardChat(true);
    const denied = await gql(CREATE, { n: "X", r: "member" }, await cookieFor(WS_A, "member"));
    expect(denied.errors).toBeDefined();
    expect(await prisma.boardPrincipal.count()).toBe(0);
  });

  it("is denied when BOARD_CHAT is off (default)", async () => {
    await setBoardChat(false);
    const r = await gql(CREATE, { n: "X" }, await cookieFor(WS_A, "admin"));
    expect(r.errors).toBeDefined();
  });

  it("is workspace-isolated — WS_A cannot see or revoke WS_B's principal", async () => {
    await setBoardChat(true);
    const b = await gql(CREATE, { n: "B Board" }, await cookieFor(WS_B, "admin"));
    const bId = b.data.createBoardPrincipal.id;

    const listA = await gql(LIST, undefined, await cookieFor(WS_A, "admin"));
    expect(listA.data.boardPrincipals).toHaveLength(0);

    const crossRevoke = await gql(REVOKE, { id: bId }, await cookieFor(WS_A, "admin"));
    expect(crossRevoke.errors).toBeDefined();
    const stillActive = await prisma.boardPrincipal.findUniqueOrThrow({ where: { id: bId } });
    expect(stillActive.revokedAt).toBeNull();
  });
});

describe("board principal actions (attribution + authz)", () => {
  it("a chair posting a board turn is attributed by boardPrincipalId; its key authenticates", async () => {
    const { principal, plainKey } = await createBoardPrincipal({
      workspaceId: WS_A,
      name: "Chair",
      role: "chair",
      createdByProfileId: humanId,
    });

    const { userMessage } = await postBoardMessageAsPrincipal({
      workspaceId: WS_A,
      principalId: principal.id,
      body: "Board directive: review Q3 spend",
    });
    expect(userMessage.boardPrincipalId).toBe(principal.id);
    expect(userMessage.authorId).toBeNull();

    // The board key resolves back to its principal (deferred middleware core).
    const resolved = await authenticateBoardPrincipal(plainKey);
    expect(resolved?.id).toBe(principal.id);
  });

  it("board-authz refuses an observer from posting (readable reason)", async () => {
    const { principal } = await createBoardPrincipal({
      workspaceId: WS_A,
      name: "Watcher",
      role: "observer",
    });
    await expect(
      postBoardMessageAsPrincipal({ workspaceId: WS_A, principalId: principal.id, body: "hi" }),
    ).rejects.toThrow(/not permitted to post/);
    expect(await prisma.boardMessage.count()).toBe(0);
  });

  it("a revoked principal's key no longer authenticates", async () => {
    const { principal, plainKey } = await createBoardPrincipal({ workspaceId: WS_A, name: "Temp" });
    expect(await authenticateBoardPrincipal(plainKey)).not.toBeNull();
    const { revokeBoardPrincipal } = await import("../../src/server/services/board-principals");
    await revokeBoardPrincipal(WS_A, principal.id);
    expect(await authenticateBoardPrincipal(plainKey)).toBeNull();
  });
});
