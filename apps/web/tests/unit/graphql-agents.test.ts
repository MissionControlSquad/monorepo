import { describe, it, expect, beforeAll } from "vitest";
import { createTestAgent } from "../helpers";
import { POST } from "../../app/api/graphql/route";

/**
 * Integration test for GraphQL agents query.
 * Requires DB (runs with default vitest config + setup).
 * Calls the app's GraphQL route so schema and execution use the same graphql instance (avoids "another module or realm").
 */
async function runGraphQL(query: string, variables?: Record<string, unknown>) {
  const req = new Request("http://test/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const res = await POST(req);
  const text = await res.text();
  if (!text) return { data: undefined, errors: [{ message: "Empty response" }] };
  return JSON.parse(text) as { data?: unknown; errors?: { message: string }[] };
}

describe("GraphQL agents query", () => {
  let testAgentId: string;
  let testAgentName: string;

  beforeAll(async () => {
    const { agent } = await createTestAgent({ name: "GraphQL Test Agent", role: "Developer" });
    testAgentId = agent.id;
    testAgentName = agent.name;
  });

  it("returns agents with id and name", async () => {
    const result = await runGraphQL(`query { agents { id name } }`);

    expect(result.errors).toBeFalsy();
    expect(result.data).toBeDefined();
    expect(Array.isArray((result.data as any).agents)).toBe(true);
    const agents = (result.data as any).agents as { id: string; name: string }[];
    expect(agents.length).toBeGreaterThanOrEqual(1);
    const found = agents.find((a) => a.id === testAgentId);
    expect(found).toBeDefined();
    expect(found!.name).toBe(testAgentName);
  });

  it("returns single agent by id", async () => {
    const result = await runGraphQL(
      `query Agent($id: String!) { agent(id: $id) { id name } }`,
      { id: testAgentId },
    );

    expect(result.errors).toBeFalsy();
    expect((result.data as any).agent).toBeDefined();
    expect((result.data as any).agent.id).toBe(testAgentId);
    expect((result.data as any).agent.name).toBe(testAgentName);
  });
});
