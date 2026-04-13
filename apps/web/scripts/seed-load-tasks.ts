/**
 * Create 5000 tasks via Prisma for load testing the kanban.
 * No API, no events — fast bulk insert. Uses existing agent for createdByProfileId if any.
 *
 * Run: npx dotenv -e .env -- tsx scripts/seed-load-tasks.ts
 * Or:  SEED_LOAD_COUNT=1000 npx dotenv -e .env -- tsx scripts/seed-load-tasks.ts
 */

import { prisma } from "../src/server/prisma";
import { TaskStatus, Priority } from "../src/server/constants";

const COUNT = parseInt(process.env.SEED_LOAD_COUNT ?? "5000", 10);
const BATCH_SIZE = 500;

const STATUSES = Object.values(TaskStatus);
const PRIORITIES = [Priority.LOW, Priority.MEDIUM, Priority.HIGH];

const TITLES = [
  "Implement auth flow",
  "Refactor API layer",
  "Add unit tests",
  "Fix responsive layout",
  "Document API",
  "Optimize queries",
  "Setup CI pipeline",
  "Design system tokens",
  "E2E test checkout",
  "Migrate to React 19",
  "Accessibility audit",
  "Deploy to staging",
  "Review PR",
  "Update dependencies",
  "Fix bug in parser",
  "Add error boundary",
  "Improve logging",
  "Write migration",
];
const DESCRIPTIONS = [
  "As a user I need to complete the flow so that we meet the acceptance criteria.",
  "Technical approach: we will iterate and test. Acceptance criteria: covered by specs.",
  "Implement the agreed scope and add tests.",
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function run() {
  console.log(`🌱 Seed load tasks: creating ${COUNT} tasks (batch size ${BATCH_SIZE})...`);

  const firstAgent = await prisma.agent.findFirst({ select: { id: true } });
  let createdByProfileId: string | null = null;
  if (firstAgent) {
    const profile = await prisma.profile.findFirst({ where: { agentId: firstAgent.id } });
    createdByProfileId = profile?.id ?? null;
  }
  if (!createdByProfileId)
    console.log("   No agent/profile found; tasks will have createdByProfileId = null.");

  let created = 0;
  const start = Date.now();

  for (let offset = 0; offset < COUNT; offset += BATCH_SIZE) {
    const batchSize = Math.min(BATCH_SIZE, COUNT - offset);
    const data = Array.from({ length: batchSize }, (_, i) => {
      const n = offset + i + 1;
      return {
        title: `Load test #${n}: ${pick(TITLES)}`,
        description: pick(DESCRIPTIONS),
        status: STATUSES[n % STATUSES.length],
        priority: PRIORITIES[n % PRIORITIES.length],
        createdByProfileId,
      };
    });

    await prisma.task.createMany({ data });
    created += batchSize;
    if (created % 1000 === 0 || created === COUNT) {
      console.log(`   Created ${created}/${COUNT} tasks...`);
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`✅ Done. ${created} tasks created in ${elapsed}s.`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
