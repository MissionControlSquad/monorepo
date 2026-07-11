import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Run unit tests that need no database (e.g. middleware).
 * Usage: npx vitest run -c vitest.unit-no-db.config.ts
 * Or: npm run test:unit:no-db
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "tests/unit/middleware.test.ts",
      "tests/unit/notification-handler.test.ts",
      "tests/unit/json-response.test.ts",
      "tests/unit/logger.test.ts",
      "tests/unit/license.test.ts",
      "tests/unit/tenancy.test.ts",
      "tests/unit/trust.test.ts",
      "tests/unit/budget-window.test.ts",
      "tests/unit/ledger-bucket.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
