/**
 * Backfill profiles: create one Profile per Agent (no legacy columns; channel tables use profileId only).
 *
 * Run: npx dotenv -e .env -- tsx scripts/backfill-profiles.ts
 */

import { prisma } from "../src/server/prisma";
import { ProfileKind } from "@prisma/client";

async function main() {
  const agents = await prisma.agent.findMany({ orderBy: { id: "asc" } });

  console.log(`Found ${agents.length} agents. Creating profiles...`);

  for (const agent of agents) {
    const existing = await prisma.profile.findFirst({
      where: { agentId: agent.id },
    });
    if (existing) continue;

    let username = agent.username?.trim() || null;
    if (username) {
      const taken = await prisma.profile.findUnique({ where: { username } });
      if (taken) username = `agent_${agent.id.slice(-8)}`;
    } else {
      username = `agent_${agent.id.slice(-8)}`;
    }

    await prisma.profile.create({
      data: {
        kind: ProfileKind.agent,
        displayName: agent.name || "Agent",
        username,
        avatarUrl: agent.avatar ?? undefined,
        agentId: agent.id,
      },
    });
  }

  console.log("Backfill done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
