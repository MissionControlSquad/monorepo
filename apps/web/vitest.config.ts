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
    // E2E tests share DB state so they run sequentially with their own setup
    // Unit tests are isolated and can run in parallel
    fileParallelism: false,
    setupFiles: ["./tests/setup.ts"],
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
