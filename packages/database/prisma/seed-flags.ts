import { PrismaClient } from "@prisma/client";
import { FLAG_KEYS } from "../src/lib/feature-flag-keys";

const DEFAULT_FLAGS: {
  key: string;
  enabled: boolean;
  managedBy: "system" | "user";
  description: string;
}[] = [
  // System-managed: controlled from infra only (plan-gated)
  {
    key: FLAG_KEYS.CHANNELS,
    enabled: true,
    managedBy: "system",
    description: "Team messaging channels and DMs",
  },
  {
    key: FLAG_KEYS.ANALYTICS,
    enabled: true,
    managedBy: "system",
    description: "Analytics dashboard with charts and metrics",
  },
  {
    key: FLAG_KEYS.RECURRING_TASKS,
    enabled: true,
    managedBy: "system",
    description: "Recurring/scheduled task templates",
  },
  {
    key: FLAG_KEYS.CLOUD_VMS,
    enabled: true,
    managedBy: "system",
    description: "Cloud VM provisioning for agents",
  },
  {
    key: FLAG_KEYS.REVIEWS,
    enabled: true,
    managedBy: "system",
    description: "Task review workflow (approve/reject/clarify)",
  },
  {
    key: FLAG_KEYS.DOCUMENTS,
    enabled: true,
    managedBy: "system",
    description: "Document management and project docs",
  },

  // User-managed: client admins can toggle these themselves
  {
    key: FLAG_KEYS.AGENT_QUEUE,
    enabled: true,
    managedBy: "user",
    description: "Agent work queue management",
  },
  {
    key: FLAG_KEYS.NOTIFICATIONS,
    enabled: true,
    managedBy: "user",
    description: "Push and email notifications",
  },
  {
    key: FLAG_KEYS.LIVE_GATEWAY,
    enabled: false,
    managedBy: "system",
    description: "Live WebSocket task delivery — AgentCenter Bridge plugin connects any machine for sub-second task assignment",
  },
];

export async function seedFeatureFlags(prisma: PrismaClient) {
  for (const flag of DEFAULT_FLAGS) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      update: { managedBy: flag.managedBy },
      create: flag,
    });
  }
}

// Allow direct execution
if (require.main === module) {
  const prisma = new PrismaClient();
  seedFeatureFlags(prisma)
    .then(() => {
      console.log("Feature flags seeded");
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
