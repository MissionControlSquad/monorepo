import { test as setup, expect } from "@playwright/test";
import path from "node:path";

const authFile = path.join(__dirname, "../.auth/admin.json");

// Production auth is buildbase-only (no password login form to drive). Playwright can't run a real
// buildbase OAuth flow, so it bootstraps a session via the TEST-ONLY route POST /api/test/session,
// which is fail-closed: it only works when the app runs with NODE_ENV=test AND the shared
// TEST_SESSION_SECRET matches. We drive it through `page.request` so the Set-Cookie lands in the
// browser context and is captured by storageState — every authenticated spec reuses that state.
setup("authenticate as admin", async ({ page }) => {
  const user = process.env.ADMIN_USER ?? "admin";
  const secret = process.env.TEST_SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "TEST_SESSION_SECRET is required for the e2e auth setup - set it in e2e/.env (see e2e/.env.example) " +
        "and run the app under test with NODE_ENV=test + the same TEST_SESSION_SECRET.",
    );
  }

  const res = await page.request.post("/api/test/session", {
    headers: { "x-test-secret": secret },
    data: { username: user },
  });
  expect(res.ok(), "test-only session bootstrap should succeed (NODE_ENV=test + secret)").toBeTruthy();

  // Confirm the session actually authenticates the dashboard (the grouped nav rail renders "Agents").
  await page.goto("/");
  await expect(page.getByText("Agents", { exact: true }).first()).toBeVisible();

  await page.context().storageState({ path: authFile });
});
