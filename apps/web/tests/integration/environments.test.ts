import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { hashApiKey } from "../../src/server/api-key";
import { createJWT } from "../../src/lib/jwt";
import { POST as GRAPHQL } from "../../app/api/graphql/route";
import { invalidateFlagCache } from "../../src/server/feature-flags";
import {
  createEnvironment,
  removeEnvironmentIfDeletable,
} from "../../src/server/services/environments";

// Tier D / Phase 3: Environment CRUD via GraphQL. ENVIRONMENTS-gated; mutations admin, reads member.
const WS = "ws_envs";
const GQL_SECRET = "envs-secret";

async function gql(query: string, role: "admin" | "member" = "admin") {
  const token = await createJWT({ userId: "u1", workspaceId: WS, userRole: role }, GQL_SECRET);
  const req = new Request("http://test/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `bb-workspace-token=${token}` },
    body: JSON.stringify({ query }),
  });
  return JSON.parse(await (await GRAPHQL(req)).text()) as {
    data?: any;
    errors?: { message: string }[];
  };
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = GQL_SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE environments, agents CASCADE`);
  await prisma.featureFlag.upsert({
    where: { key: "environments" },
    create: { key: "environments", enabled: true, managedBy: "user" },
    update: { enabled: true },
  });
  invalidateFlagCache();
});

describe("Environment CRUD", () => {
  it("creates a local env, lists it, and masks nothing (no secrets)", async () => {
    const res = await gql(
      `mutation{ createEnvironment(name:"Local", driver:"local"){ id driver status configPublic } }`,
    );
    expect(res.errors).toBeFalsy();
    expect(res.data.createEnvironment).toMatchObject({ driver: "local", status: "active" });

    const list = await gql(`query{ environments{ id name driver } }`, "member");
    expect(list.data.environments).toHaveLength(1);
    expect(list.data.environments[0].name).toBe("Local");
  });

  it("creates a sandbox env for a known provider (via GraphQL)", async () => {
    const ok = await gql(
      `mutation{ createEnvironment(name:"Sbx", driver:"sandbox", config:{provider:"local"}){ id configPublic } }`,
    );
    expect(ok.errors).toBeFalsy();
    expect(ok.data.createEnvironment.configPublic).toMatchObject({ provider: "local" });
  });

  // Error-message assertions run at the service layer: Yoga masks resolver errors to a generic
  // "Unexpected error." over the wire, so specific messages are verified here (as sandbox-run does).
  it("rejects an unknown sandbox provider", async () => {
    await expect(
      createEnvironment(WS, { name: "Sbx2", driver: "sandbox", config: { provider: "nope" } }),
    ).rejects.toThrow(/Unknown sandbox provider/i);
  });

  it("stores an ssh secret as a secret-ref and masks it on read (never plaintext)", async () => {
    const res = await gql(
      `mutation{ createEnvironment(name:"SSH", driver:"ssh", config:{host:"1.2.3.4", privateKey:{secretRef:{name:"SSH_KEY"}}}){ configPublic } }`,
    );
    expect(res.errors).toBeFalsy();
    const cfg = res.data.createEnvironment.configPublic;
    expect(cfg.host).toBe("1.2.3.4");
    // the private key is returned MASKED — the pointer name, never a value
    expect(cfg.privateKey).toBe("secret:SSH_KEY");
    expect(JSON.stringify(cfg)).not.toContain("secretRef");
  });

  it("rejects invalid driver config (service layer)", async () => {
    await expect(
      createEnvironment(WS, { name: "BadSSH", driver: "ssh", config: {} }),
    ).rejects.toThrow(/Invalid ssh config/i);
  });

  it("enforces name uniqueness and the one-local-per-workspace partial index", async () => {
    await createEnvironment(WS, { name: "Dup", driver: "sandbox", config: { provider: "local" } });
    await expect(
      createEnvironment(WS, { name: "Dup", driver: "sandbox", config: { provider: "local" } }),
    ).rejects.toThrow(/already exists/i);

    await createEnvironment(WS, { name: "L1", driver: "local" });
    await expect(createEnvironment(WS, { name: "L2", driver: "local" })).rejects.toThrow(
      /local environment already exists/i,
    );
  });

  it("updates and archives an environment", async () => {
    const created = await gql(`mutation{ createEnvironment(name:"E", driver:"local"){ id } }`);
    const id = created.data.createEnvironment.id;

    const upd = await gql(
      `mutation{ updateEnvironment(id:"${id}", description:"prod"){ id description } }`,
    );
    expect(upd.data.updateEnvironment.description).toBe("prod");

    const arch = await gql(`mutation{ archiveEnvironment(id:"${id}"){ status } }`);
    expect(arch.data.archiveEnvironment.status).toBe("archived");
  });

  it("blocks deletion while an agent references the env; allows it once unbound", async () => {
    const created = await gql(`mutation{ createEnvironment(name:"Bound", driver:"local"){ id } }`);
    const id = created.data.createEnvironment.id;
    const agent = await prisma.agent.create({
      data: {
        name: "A",
        role: "worker",
        personality: "x",
        workspaceId: WS,
        setupStatus: "active",
        apiKeyHash: hashApiKey(`mc_env_${Math.random()}`),
        environmentId: id,
      },
    });

    const blast = await gql(
      `query{ environmentDeleteBlastRadius(id:"${id}"){ deletable referencingAgentCount reasons } }`,
      "member",
    );
    expect(blast.data.environmentDeleteBlastRadius).toMatchObject({
      deletable: false,
      referencingAgentCount: 1,
    });

    // service layer: specific "Cannot delete" message; gql path: errors surfaced (masked message)
    await expect(removeEnvironmentIfDeletable(WS, id)).rejects.toThrow(/Cannot delete/i);
    const blocked = await gql(`mutation{ deleteEnvironment(id:"${id}") }`);
    expect(blocked.errors).toBeTruthy();
    expect(await prisma.environment.count({ where: { id } })).toBe(1); // still there

    await prisma.agent.update({ where: { id: agent.id }, data: { environmentId: null } });
    const ok = await gql(`mutation{ deleteEnvironment(id:"${id}") }`);
    expect(ok.errors).toBeFalsy();
    expect(ok.data.deleteEnvironment).toBe(true);
  });

  it("gates mutations on admin (member is denied)", async () => {
    const res = await gql(
      `mutation{ createEnvironment(name:"X", driver:"local"){ id } }`,
      "member",
    );
    expect(res.errors).toBeTruthy();
    expect(await prisma.environment.count()).toBe(0);
  });

  it("exposes the capabilities matrix (drivers + sandbox providers)", async () => {
    const res = await gql(
      `query{ environmentCapabilities{ drivers sandboxProviders{ key isolating } } }`,
      "member",
    );
    expect(res.data.environmentCapabilities.drivers).toContain("sandbox");
    const local = res.data.environmentCapabilities.sandboxProviders.find(
      (p: { key: string }) => p.key === "local",
    );
    expect(local).toMatchObject({ isolating: false });
  });
});
