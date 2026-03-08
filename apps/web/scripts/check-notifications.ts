/**
 * List recent notifications from the database to verify they're being created.
 *
 * Run: npx dotenv -e .env -- tsx scripts/check-notifications.ts
 * Or:  LIMIT=20 npx dotenv -e .env -- tsx scripts/check-notifications.ts
 */

import { prisma } from "../src/server/prisma";

const LIMIT = parseInt(process.env.LIMIT ?? "20", 10);

async function run() {
  const notifications = await prisma.notification.findMany({
    take: LIMIT,
    orderBy: { createdAt: "desc" },
    include: {
      mentionedAgent: { select: { id: true, name: true } },
      task: { select: { id: true, taskNumber: true, title: true } },
    },
  });

  console.log(`\n📬 Last ${notifications.length} notifications (newest first):\n`);
  if (notifications.length === 0) {
    console.log("  (none)");
    console.log("\nCreate a task with an assignee to generate notifications.\n");
    return;
  }

  for (const n of notifications) {
    const at = n.createdAt.toISOString();
    const agent = n.mentionedAgent?.name ?? n.mentionedAgentId;
    const taskRef = n.task ? ` #${n.task.taskNumber} "${n.task.title}"` : "";
    const delivered = n.delivered ? " [delivered]" : "";
    console.log(`  ${at}  [${agent}] ${n.content.slice(0, 60)}${n.content.length > 60 ? "…" : ""}${taskRef}${delivered}`);
  }
  console.log("");
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
