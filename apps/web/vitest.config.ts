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
    // Integration files share the DB + process.env, so each runs in its own isolated worker (default
    // isolate:true) with no cross-file file parallelism. See tests/setup.ts for the per-file DB
    // truncation + DISABLE_FLAG_CACHE that keep cross-file state clean.
    fileParallelism: false,
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
