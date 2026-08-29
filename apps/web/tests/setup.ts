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
      -- licenses is cleared per file (shared DB across test files). Feature entitlement is no longer a
      -- DB table — it's the in-process setTestFeature seam (feature-flags.ts), reset per isolated fork,
      -- so every file starts from all-flags-default-enabled; files needing a flag off set it in their
      -- own beforeEach.
      licenses,
      -- newer tables (added by later features) that must also reset per file so their rows do not
      -- leak across shared-DB test files (e.g. memory_jobs enqueued by run-completion in one file
      -- otherwise crowd another file's claim batch).
      memory_jobs,
      agent_wakeups,
      run_log_chunks,
      run_log_meta,
      secret_proposals,
      external_objects,
      agent_runs,
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
      task_labels,
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
      document_revisions,
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

  // Bring the test database up to the migrated schema. We run the real migration chain
  // (`migrate deploy`) rather than `db push` so the test DB is prod-faithful: raw-SQL migration
  // artifacts (seed rows like the built-in adapters, partial/expression indexes, backfills) are
  // present, closing the long-standing "db push != migrate" gap. After the first run this is a fast
  // no-op ("No pending migrations"). AI_AGENT/CLAUDECODE are stripped so Prisma's agent guardrail
  // doesn't block the non-interactive deploy; harmless no-op for normal/CI runs where they're unset.
  const { AI_AGENT: _ai, CLAUDECODE: _cc, ...cleanEnv } = process.env;
  execSync("npx prisma migrate deploy --config ../../packages/database/prisma.config.ts", {
    stdio: "inherit",
    env: cleanEnv,
  });

  // Start with a clean database
  await truncateAll();
});

afterAll(async () => {
  // Clean up after all tests
  await truncateAll();
  await prisma.$disconnect();
});
