import { defineConfig } from "vitest/config";
import path from "path";
import dotenv from "dotenv";

// Load .env.test so integration tests use the test database
dotenv.config({ path: path.resolve(__dirname, ".env.test") });

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 15000,
    // E2E tests share DB state so they run sequentially with their own setup.
    fileParallelism: false,
    // Run every file in ONE reused fork. Integration files each set process.env.SYSTEM_SECRET in
    // beforeAll; across multiple forks that env bleeds (a file can execute in a worker still holding a
    // previous file's secret), so auth breaks non-deterministically for whole files. A single
    // sequential fork keeps SYSTEM_SECRET correct for the file currently running. Combined with
    // DISABLE_FLAG_CACHE + per-file feature_flags/licenses truncation, cross-file state stays clean.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    setupFiles: ["./tests/setup.ts"],
    // Read feature flags fresh from the DB on every check (bypass the 60s cache). Integration tests
    // toggle flags constantly and share one worker process, so a live cache goes stale relative to
    // the DB and causes order-dependent flaky failures. Set here (committed) so CI gets it too; the
    // feature-flags cache unit test opts back out. Prod keeps the cache.
    env: { DISABLE_FLAG_CACHE: "1" },
    // Allow running subsets: `npm run test:unit` / `npm run test:e2e`
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Single graphql instance so schema and graphql() share the same "realm" (avoids GraphQLSchema error in unit tests)
    dedupe: ["graphql"],
  },
});
