import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { prisma } from "../../src/server/prisma";
import { verifySessionToken } from "../../src/server/admin-auth";
import { resolveTenancy, DEFAULT_WORKSPACE_ID } from "../../src/server/tenancy/resolve";

/**
 * SELF-HOST end-to-end auth flow (single-tenant): one AgentCenter install authenticated by a buildbase
 * org, with NO per-tenant membership gate. This is the counterpart to buildbase-bridge.test.ts (the
 * HOSTED multi-tenant case). The load-bearing difference is env `TENANT_WORKSPACE_ID` being UNSET:
 *
 *   • The auth bridge admits ANY authenticated buildbase user (no workspace.list membership check) and
 *     mints an mc_session with an EMPTY workspace token — there is no bound workspace to pin.
 *   • resolveTenancy falls back to DEFAULT_WORKSPACE_ID as `owner` for a bare mc_session — the exact
 *     fallback the hosted case (TENANT_WORKSPACE_ID set) fail-closes. This test proves that fallback
 *     still works and was not broken by the hosted fail-closed change.
 *
 * Real Postgres (.env.test). buildbase is "configured" (SAAS_* + SYSTEM_SECRET set) and the OAuth
 * code→token exchange is mocked exactly as in buildbase-bridge.test.ts. buildbase's workspace factory is
 * mocked too, but in self-host it is never consulted (asserted).
 */

const SYSTEM_SECRET = "test-selfhost-secret-1234567890";

// ── Mock the buildbase server factory (no network / real SDK). In self-host the membership plane is
//    NEVER consulted, so these throw loudly if the bridge ever tries to gate on workspace membership. ──
const listMock = vi.fn(async () => {
  throw new Error("self-host must not consult buildbase workspace membership");
});
vi.mock("@/server/tenancy/buildbase", () => ({
  BB_SESSION_COOKIE: "bb-session-id",
  WORKSPACE_TOKEN_COOKIE: "bb-workspace-token",
  readCookie: (h: string | null | undefined, n: string) =>
    h ? (h.match(new RegExp(`(?:^|;\\s*)${n}=([^;]+)`))?.[1] ?? null) : null,
  isBuildbaseConfigured: () => true,
  getBuildbase: () => ({ withSession: () => ({ workspace: { list: listMock } }) }),
}));

function cookieValue(setCookies: string[], name: string): string | undefined {
  const match = setCookies.find((c) => c.startsWith(`${name}=`));
  if (!match) return undefined;
  return match.slice(name.length + 1).split(";")[0] || undefined;
}

beforeAll(() => {
  // buildbase "configured" for a self-host install…
  process.env.SAAS_ORG_ID = "69e6895aa53f542558f527a9";
  process.env.SAAS_CLIENT_ID = "test-client-id";
  process.env.SAAS_CLIENT_SECRET = "test-client-secret";
  process.env.SYSTEM_SECRET = SYSTEM_SECRET;
  // …but NO bound workspace ⇒ single-tenant / self-host mode (this is the whole point).
  delete process.env.TENANT_WORKSPACE_ID;
});

afterAll(() => {
  // Never leak TENANT_WORKSPACE_ID (it is unset here, but be explicit so ordering can't matter).
  delete process.env.TENANT_WORKSPACE_ID;
});

afterEach(() => {
  vi.restoreAllMocks();
  listMock.mockClear();
});

/** Drive the real OAuth token route with a mocked valid buildbase code→session exchange. */
async function callToken(bbId: string, email: string, name = "Self Host User") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        data: { sessionId: "sess_selfhost", user: { id: bbId, email, name, role: "member" } },
      }),
    ),
  );
  const { POST } = await import("../../app/api/auth/buildbase/token/route");
  const { NextRequest } = await import("next/server");
  const req = new NextRequest(new URL("http://localhost:3000/api/auth/buildbase/token"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: "oauth-code-selfhost" }),
  });
  return POST(req);
}

describe("SELF-HOST buildbase flow (TENANT_WORKSPACE_ID unset)", () => {
  it("POST /api/auth/buildbase/token — admits any authenticated user: mc_session, NO workspace token, Profile upserted", async () => {
    const bbId = `bb_${Date.now()}_selfhost`;
    const email = "solo@self-host.example.com";

    const res = await callToken(bbId, email);
    expect(res.status).toBe(200); // success, NOT denied

    const setCookies = res.headers.getSetCookie();

    // mc_session is minted and encodes the buildbase identity.
    const mcValue = cookieValue(setCookies, "mc_session");
    expect(mcValue).toBeTruthy();
    const payload = await verifySessionToken(mcValue!);
    expect(payload!.sub).toBe(bbId);
    expect(payload!.username).toBe(email);

    // NOTHING to pin in self-host ⇒ NO bb-workspace-token cookie is set.
    expect(cookieValue(setCookies, "bb-workspace-token")).toBeUndefined();
    // The buildbase session cookie is still set (unchanged semantics).
    expect(cookieValue(setCookies, "bb-session-id")).toBeTruthy();

    // A local human Profile was upserted for the buildbase user.
    const profile = await prisma.profile.findUnique({ where: { buildbaseUserId: bbId } });
    expect(profile).not.toBeNull();

    // The membership plane was never consulted (no gate in self-host).
    expect(listMock).not.toHaveBeenCalled();
  });

  it("authenticated app request with that mc_session resolves tenancy = DEFAULT_WORKSPACE_ID as owner (scoped read succeeds)", async () => {
    const bbId = `bb_${Date.now()}_selfhost_app`;
    const email = "owner@self-host.example.com";

    const res = await callToken(bbId, email);
    const mcValue = cookieValue(res.headers.getSetCookie(), "mc_session")!;
    expect(mcValue).toBeTruthy();

    // Rebuild the request session exactly as the GraphQL route context does.
    const payload = await verifySessionToken(mcValue);
    expect(payload?.profileId).toBeTruthy();
    const session = {
      sub: payload!.sub,
      username: payload!.username,
      profileId: payload!.profileId!,
    };

    // resolveTenancy admits the self-host user as OWNER of the single default workspace.
    const ctx = await resolveTenancy(session, `mc_session=${mcValue}`, null);
    expect(ctx).not.toBeNull();
    expect(ctx!.workspaceId).toBe(DEFAULT_WORKSPACE_ID);
    expect(ctx!.role).toBe("owner");

    // …and a real workspace-scoped GraphQL read (member+, no feature gate) is AUTHORIZED (returns data,
    // no auth error) — proving the user is actually inside the app operating in the default workspace.
    const { POST } = await import("../../app/api/graphql/route");
    const gql = new Request("http://localhost:3000/api/graphql", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `mc_session=${mcValue}` },
      body: JSON.stringify({ query: `query{ workspaceDeliverables{ id } }` }),
    });
    const gqlRes = await POST(gql);
    const body = JSON.parse(await gqlRes.text()) as {
      data?: { workspaceDeliverables?: unknown[] };
      errors?: { message: string }[];
    };
    expect(body.errors).toBeFalsy();
    expect(Array.isArray(body.data?.workspaceDeliverables)).toBe(true);
  });

  it("negative safety: a BARE mc_session still falls back to DEFAULT_WORKSPACE_ID (the fallback hosted refuses)", async () => {
    // No workspace token, no API key — exactly what the hosted case fail-closes (see buildbase-bridge
    // test "REFUSES the default-workspace fallback"). Self-host MUST still grant it.
    const ctx = await resolveTenancy(
      { sub: "s", username: "u", profileId: "profile_selfhost" },
      null,
      null,
    );
    expect(ctx).not.toBeNull();
    expect(ctx!.workspaceId).toBe(DEFAULT_WORKSPACE_ID);
    expect(ctx!.role).toBe("owner");
  });

  it("an unauthenticated app request (no mc_session) is denied by the scoped read", async () => {
    const { POST } = await import("../../app/api/graphql/route");
    const gql = new Request("http://localhost:3000/api/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: `query{ workspaceDeliverables{ id } }` }),
    });
    const gqlRes = await POST(gql);
    const body = JSON.parse(await gqlRes.text()) as {
      data?: { workspaceDeliverables?: unknown[] | null };
      errors?: { message: string }[];
    };
    expect(body.errors).toBeDefined();
    expect(body.data?.workspaceDeliverables).toBeFalsy();
  });
});
