import { prisma } from "../src/server/prisma";
import { execSync } from "child_process";
import {
  agentCache,
  agentListCache,
  memberCache,
  projectIdsCache,
  subscriberCache,
} from "../src/server/cache";
import { afterAll, beforeAll } from "vitest";

/**
 * Global test setup.
 *
 * - beforeAll: push schema + truncate for a clean slate
 * - afterAll: truncate + disconnect
 *
 * No afterEach cleanup — e2e tests share state across tests intentionally.
 * Individual test files can add their own afterEach if they need isolation.
 */

function clearCaches() {
  agentCache.clear();
  agentListCache.clear();
  memberCache.clear();
  projectIdsCache.clear();
  subscriberCache.clear();
}

async function truncateAll() {
  clearCaches();
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      plugins,
      board_threads,
      goals,
      workspace_imports,
      team_installs,
      team_members,
      teams,
      agent_skills,
      skill_stars,
      skill_versions,
      skills,
      case_labels,
      case_documents,
      case_events,
      case_task_links,
      cases,
      labels,
      pipeline_case_events,
      pipeline_cases,
      pipeline_stages,
      pipelines,
      routine_runs,
      routine_revisions,
      routine_triggers,
      routines,
      secret_access_events,
      secret_bindings,
      secret_versions,
      secrets,
      ledger_events,
      ledger_categories,
      budget_incidents,
      quota_windows,
      budget_policies,
      cost_events,
      deliverable_versions,
      deliverables,
      message_reactions,
      message_mentions,
      message_attachments,
      messages,
      notifications,
      subscriptions,
      work_sessions,
      agent_actions,
      agent_queue_items,
      activities,
      status_history,
      documents,
      task_assignees,
      project_doc_revisions,
      project_docs,
      project_members,
      tasks,
      projects,
      task_templates,
      agents,
      admin_users
    CASCADE
  `);
}

beforeAll(async () => {
  // Push schema to test database
  execSync(
    "npx prisma db push --skip-generate --accept-data-loss --schema ../../packages/database/prisma/schema",
    {
      stdio: "inherit",
      env: { ...process.env },
    },
  );

  // Start with a clean database
  await truncateAll();
});

afterAll(async () => {
  // Clean up after all tests
  await truncateAll();
  await prisma.$disconnect();
});
