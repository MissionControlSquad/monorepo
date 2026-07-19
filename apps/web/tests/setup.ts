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
      -- feature_flags + licenses must be cleared per file: the DB is shared across test files. Many
      -- files toggle a flag off to exercise the disabled path; the row lingers because it was never
      -- truncated, so a later file that expects the feature on (e.g. goals, secrets) intermittently
      -- reads the stale disabled row and its requireFeature() gate throws. Truncating here makes every
      -- file start from all-flags-default-enabled; files that need an opt-in flag seed it in their own
      -- beforeAll/beforeEach (which run after this). (In-process caches reset per isolated fork.)
      feature_flags,
      licenses,
      attention_dismissals,
      agent_capability_grants,
      agent_authz_events,
      agent_instructions,
      terminal_sessions,
      api_keys,
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
  // Read feature flags fresh from the DB on every check (bypass the 60s cache). Integration tests
  // toggle flags constantly and share a reused worker process, so a live cache goes stale relative to
  // the DB and causes order-dependent flaky failures. This MUST be set per file (not once at module
  // load): the feature-flags cache unit test deletes this env var in its own beforeEach, and because a
  // worker is reused across files, a module-level assignment would stay deleted for every later file
  // in that worker — reviving the cache and bleeding flag state. Setting it in this per-file beforeAll
  // re-asserts it for each file. cacheTtl() reads it at call time.
  process.env.DISABLE_FLAG_CACHE = "1";

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
