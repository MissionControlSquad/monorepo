import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import { getDecrypted } from "../../src/server/services/secrets";
import {
  createProposal,
  listProposals,
  approveProposal,
  denyProposal,
} from "../../src/server/services/secret-proposals";

/**
 * Human-approved secret proposals (Paperclip #9934 port) — real GraphQL route + Postgres. Proves the
 * propose -> list -> approve (materializes a real vault secret) -> deny lifecycle, that no plaintext
 * value is stored on the proposal, admin-gating, and workspace isolation. Precise behaviour is
 * asserted by calling the service functions directly (repo convention).
 */
const SECRET = "secret-proposals-test-secret";
const WS_A = "ws_proposals_A";
const WS_B = "ws_proposals_B";

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
  const token = await createJWT({ userId: "human_" + role, workspaceId, userRole: role }, SECRET);
  return `bb-workspace-token=${token}`;
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
  process.env.SECRET_ENCRYPTION_KEY = "integration-test-master-key-1234567890";
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE secret_proposals, secrets, secret_provider_configs, agents CASCADE`,
  );
});

describe("propose -> list -> approve -> deny (secret proposals)", () => {
  it("approving a proposal materializes a real, encrypted vault secret and links it", async () => {
    const proposal = await createProposal({
      workspaceId: WS_A,
      name: "OPENAI_API_KEY",
      description: "Agent needs OpenAI access for summarization",
      scope: "workspace",
      requestedByAgentId: null,
      placeholderValue: "sk-...",
    });
    expect(proposal.status).toBe("pending");

    // List returns the pending proposal, scoped to the workspace.
    const pending = await listProposals(WS_A, "pending");
    expect(pending.map((p) => p.id)).toContain(proposal.id);

    // Approve: the admin supplies the real value; a live secret is created via the secrets service.
    const { proposal: approved, secret } = await approveProposal({
      workspaceId: WS_A,
      proposalId: proposal.id,
      value: "sk-live-REAL-VALUE",
      decidedByProfileId: "human_admin",
    });
    expect(approved.status).toBe("approved");
    expect(approved.decidedByProfileId).toBe("human_admin");
    expect(approved.decidedAt).not.toBeNull();
    expect(approved.createdSecretId).toBe(secret.id);

    // A real secret row now exists in the vault, encrypted at rest, decrypting to the supplied value.
    const row = await prisma.secret.findFirstOrThrow({
      where: { workspaceId: WS_A, name: "OPENAI_API_KEY" },
    });
    expect(row.id).toBe(secret.id);
    expect((await getDecrypted(WS_A, row.id))?.value).toBe("sk-live-REAL-VALUE");

    // No plaintext secret was ever persisted on the proposal.
    const fresh = await prisma.secretProposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(fresh.placeholderValue).toBe("sk-...");
    expect(JSON.stringify(fresh)).not.toContain("sk-live-REAL-VALUE");
  });

  it("denying a proposal records the reason and creates no secret", async () => {
    const proposal = await createProposal({ workspaceId: WS_A, name: "AWS_KEY" });
    const denied = await denyProposal({
      workspaceId: WS_A,
      proposalId: proposal.id,
      reason: "Use the shared workspace role instead",
      decidedByProfileId: "human_admin",
    });
    expect(denied.status).toBe("denied");
    expect(denied.decisionReason).toBe("Use the shared workspace role instead");
    expect(await prisma.secret.count({ where: { workspaceId: WS_A, name: "AWS_KEY" } })).toBe(0);
  });

  it("a decided proposal cannot be approved or denied again", async () => {
    const proposal = await createProposal({ workspaceId: WS_A, name: "STRIPE_KEY" });
    await approveProposal({
      workspaceId: WS_A,
      proposalId: proposal.id,
      value: "sk-stripe",
      decidedByProfileId: "human_admin",
    });
    await expect(
      denyProposal({
        workspaceId: WS_A,
        proposalId: proposal.id,
        reason: "too late",
        decidedByProfileId: "human_admin",
      }),
    ).rejects.toThrow(/already approved/);
  });
});

describe("RBAC + flag (secret proposals)", () => {
  const CREATE = `mutation($n:String!){ createSecretProposal(name:$n){ id status } }`;
  const APPROVE = `mutation($id:String!,$v:String!){ approveSecretProposal(id:$id, value:$v){ id status createdSecretId } }`;
  const DENY = `mutation($id:String!,$r:String!){ denySecretProposal(id:$id, reason:$r){ id status } }`;

  it("a member may file a proposal but only an admin may approve/deny", async () => {
    // Member files a proposal.
    const filed = await gql(CREATE, { n: "GITHUB_TOKEN" }, await cookieFor(WS_A, "member"));
    expect(filed.errors).toBeFalsy();
    const id = filed.data.createSecretProposal.id;

    // Member cannot approve.
    const memberApprove = await gql(APPROVE, { id, v: "ghp_x" }, await cookieFor(WS_A, "member"));
    expect(memberApprove.errors).toBeDefined();
    expect(memberApprove.data?.approveSecretProposal).toBeFalsy();

    // Admin approves — a real secret is created and linked.
    const adminApprove = await gql(APPROVE, { id, v: "ghp_real" }, await cookieFor(WS_A, "admin"));
    expect(adminApprove.errors).toBeFalsy();
    expect(adminApprove.data.approveSecretProposal.status).toBe("approved");
    expect(adminApprove.data.approveSecretProposal.createdSecretId).toBeTruthy();
    expect((await getDecrypted(WS_A, adminApprove.data.approveSecretProposal.createdSecretId))?.value).toBe(
      "ghp_real",
    );
  });

  it("denying requires a reason and is admin-only", async () => {
    const filed = await gql(CREATE, { n: "SLACK_TOKEN" }, await cookieFor(WS_A, "member"));
    const id = filed.data.createSecretProposal.id;

    const memberDeny = await gql(DENY, { id, r: "no" }, await cookieFor(WS_A, "member"));
    expect(memberDeny.errors).toBeDefined();

    const adminDeny = await gql(DENY, { id, r: "not needed" }, await cookieFor(WS_A, "admin"));
    expect(adminDeny.data.denySecretProposal.status).toBe("denied");
  });
});

describe("workspace isolation (secret proposals)", () => {
  it("a workspace cannot see or decide another workspace's proposal", async () => {
    const inB = await createProposal({ workspaceId: WS_B, name: "B_ONLY" });

    // WS_A's listing never includes WS_B's proposal.
    const list = await gql(
      `query{ secretProposals{ id } }`,
      undefined,
      await cookieFor(WS_A, "member"),
    );
    expect((list.data.secretProposals as any[]).map((p) => p.id)).not.toContain(inB.id);

    // WS_A admin cannot approve WS_B's proposal (NOT_FOUND across the boundary).
    const cross = await gql(
      `mutation($id:String!,$v:String!){ approveSecretProposal(id:$id, value:$v){ id } }`,
      { id: inB.id, v: "x" },
      await cookieFor(WS_A, "admin"),
    );
    expect(cross.errors).toBeDefined();
    const untouched = await prisma.secretProposal.findUniqueOrThrow({ where: { id: inB.id } });
    expect(untouched.status).toBe("pending");
  });
});
