import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const authFile = path.join(__dirname, "../.auth/admin.json");
const seedSessionFile = path.join(__dirname, "../.auth/seed-session.json");

/**
 * Production auth is buildbase-only (no password form Playwright can drive). We establish an admin
 * session one of two ways, preferring the first:
 *
 *  1. SEED HANDOFF (default in CI): the seed step mints an mc_session via the ungated createSessionToken
 *     (AUTH_SECRET-signed) and writes it to e2e/.auth/seed-session.json. We inject that cookie into the
 *     browser context. This authenticates against the served *production* app directly — no
 *     NODE_ENV=test and no TEST_SESSION_SECRET required (the Next CLI forces production at runtime, so
 *     the NODE_ENV=test-gated /api/test/session route can't be reached behind `next start`).
 *
 *  2. TEST-ONLY ROUTE (local dev under NODE_ENV=test): when there is no seed file but TEST_SESSION_SECRET
 *     is set, POST /api/test/session to mint the session. Fail-closed on the server.
 *
 * Either way we save storageState so every authenticated spec reuses the session.
 */
setup("authenticate as admin", async ({ page, context, baseURL }) => {
  if (fs.existsSync(seedSessionFile)) {
    const { cookie, baseUrl } = JSON.parse(fs.readFileSync(seedSessionFile, "utf8")) as {
      cookie: string;
      baseUrl: string;
    };
    expect(cookie, "seed-session.json must carry an mc_session value").toBeTruthy();
    const url = new URL(baseUrl || baseURL || "http://localhost:3000");
    await context.addCookies([
      {
        name: "mc_session",
        value: cookie,
        domain: url.hostname,
        path: "/",
        httpOnly: true,
        secure: url.protocol === "https:",
        sameSite: "Lax",
      },
    ]);
  } else {
    const secret = process.env.TEST_SESSION_SECRET;
    if (!secret) {
      throw new Error(
        "No e2e/.auth/seed-session.json (seed handoff) and no TEST_SESSION_SECRET fallback — cannot " +
          "authenticate the e2e admin. In CI, set E2E_WRITE_STORAGE_STATE=1 on the Seed step so the " +
          "seed writes the session; locally, run the app under NODE_ENV=test with TEST_SESSION_SECRET.",
      );
    }
    const user = process.env.ADMIN_USER ?? "admin";
    const res = await page.request.post("/api/test/session", {
      headers: { "x-test-secret": secret },
      data: { username: user },
    });
    expect(res.ok(), "test-only session bootstrap should succeed (NODE_ENV=test + secret)").toBeTruthy();
  }

  // Confirm the session actually authenticates the dashboard (the grouped nav rail renders "Agents").
  await page.goto("/");
  await expect(page.getByText("Agents", { exact: true }).first()).toBeVisible();

  await page.context().storageState({ path: authFile });
});
