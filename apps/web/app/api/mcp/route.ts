// MCP server scaffold — exposes read-only buildbase workspace tools to AI agents over
// Streamable HTTP (spec-compliant via @buildbase/sdk/mcp). Dormant until the buildbase org
// is provisioned: with NEXT_PUBLIC_SAAS_ORG_ID / NEXT_PUBLIC_SAAS_SERVER_URL / BUILDBASE_MCP_SECRET
// unset, every method returns 503 and nothing else in the app is affected. This mirrors the
// BuildbaseProvider ORG_ID gate — code lands now, activates on provisioning.
//
// Boundary note: buildbase owns MCP + the user/workspace tool surface. AI-agent domain tools
// (issues/deliverables/budgets) would be added later via defineMcpTool with a context() factory
// that injects our services — deliberately NOT scaffolded here (kept read-only + minimal).
import BuildBase from "@buildbase/sdk";
import { buildbaseAuth, createMcpHandler } from "@buildbase/sdk/mcp";

// Reuse the same org/server values the client BuildbaseProvider reads, so provisioning one set
// enables both. The signing secret is server-private (never NEXT_PUBLIC_).
const ORG_ID = process.env.NEXT_PUBLIC_SAAS_ORG_ID ?? "";
const SERVER_URL = process.env.NEXT_PUBLIC_SAAS_SERVER_URL ?? "";
const MCP_SECRET = process.env.BUILDBASE_MCP_SECRET ?? "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

// All three are required for the handler to function; absent any, the endpoint stays dormant.
const configured = Boolean(ORG_ID && SERVER_URL && MCP_SECRET);

const handler = configured
  ? createMcpHandler({
      // The built-in tools run under the per-request session resolved from the Bearer token
      // (auth.verify → sessionId), so the base client needs no ambient getSessionId.
      buildbase: BuildBase({ serverUrl: SERVER_URL, orgId: ORG_ID }),
      serverInfo: { name: "agentcenter-mcp", version: "0.1.0" },
      instructions: "Agent Center MCP — read-only workspace tools (scaffold).",
      // Least privilege: reads only until we deliberately opt into writes.
      builtinTools: "readonly",
      auth: buildbaseAuth({
        secret: MCP_SECRET,
        resource: APP_URL ? `${APP_URL}/api/mcp` : undefined,
      }),
    })
  : null;

function notConfigured(): Response {
  return Response.json(
    {
      error: "mcp_not_configured",
      message:
        "MCP is dormant. Set NEXT_PUBLIC_SAAS_ORG_ID, NEXT_PUBLIC_SAAS_SERVER_URL and BUILDBASE_MCP_SECRET to enable.",
    },
    { status: 503 },
  );
}

export async function POST(request: Request): Promise<Response> {
  return handler ? handler.fetch(request) : notConfigured();
}

export async function GET(request: Request): Promise<Response> {
  return handler ? handler.fetch(request) : notConfigured();
}

export async function DELETE(request: Request): Promise<Response> {
  return handler ? handler.fetch(request) : notConfigured();
}

export async function OPTIONS(request: Request): Promise<Response> {
  // When configured, the SDK answers CORS preflight; otherwise a bare 204.
  return handler ? handler.fetch(request) : new Response(null, { status: 204 });
}
