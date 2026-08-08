import { test as setup, expect } from "@playwright/test";
import path from "node:path";

const authFile = path.join(__dirname, "../.auth/admin.json");

// Logs in once through the real login form and saves the session cookies. Every authenticated spec
// reuses this state instead of logging in per test - the single biggest speed win Playwright offers.
setup("authenticate as admin", async ({ page }) => {
  const user = process.env.ADMIN_USER ?? "admin";
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error(
      "ADMIN_PASSWORD is required for the e2e auth setup - set it in e2e/.env (see e2e/.env.example)",
    );
  }

  await page.goto("/login");
  await page.getByPlaceholder(/username/i).fill(user);
  await page.getByPlaceholder(/password/i).fill(password);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45_000 }),
    page.getByRole("button", { name: /sign in/i }).click(),
  ]);

  // Confirm we actually reached the dashboard (the grouped nav rail renders "Agents").
  await expect(page.getByText("Agents", { exact: true }).first()).toBeVisible();

  await page.context().storageState({ path: authFile });
});
