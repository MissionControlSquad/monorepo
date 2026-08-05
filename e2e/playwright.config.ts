import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

// Playwright is the single UI / E2E framework for this monorepo. The same command runs identically
// on a dev machine and in GitHub Actions. See docs/testing/README.md.
const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;
const IS_CI = !!process.env.CI;
const IS_REMOTE = !BASE_URL.includes("localhost");

// The web app lives at apps/web. Locally we attach to a running dev server; in CI we boot one.
// `next dev` serves HTTP fine for these specs (the graphql-ws channel is not needed here).
const WEB_COMMAND = process.env.PW_WEB_COMMAND ?? "npm run dev --workspace @agentcenter/web";

export default defineConfig({
  testDir: "./specs",
  outputDir: "./.results",
  fullyParallel: true,
  forbidOnly: IS_CI,
  retries: IS_CI ? 2 : 0,
  workers: IS_CI ? 4 : undefined,
  timeout: 90_000,
  expect: { timeout: 15_000 },

  reporter: IS_CI
    ? [["github"], ["blob"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "on-failure" }]],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    testIdAttribute: "data-testid",
  },

  projects: [
    { name: "setup", testDir: "./setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      testDir: "./specs",
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(__dirname, ".auth/admin.json"),
      },
      dependencies: ["setup"],
    },
  ],

  // Locally, reuse a dev server you already have running on :3000. In CI, boot one fresh.
  webServer: IS_REMOTE
    ? undefined
    : {
        command: WEB_COMMAND,
        url: `${BASE_URL}/api/health`,
        reuseExistingServer: !IS_CI,
        timeout: 240_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
