import { test, expect, type Page } from "@playwright/test";

// Broad, shallow smoke net over the core dashboard screens. Every primary screen a signed-in user can
// reach must render inside the app shell without tripping an error boundary or bouncing to /login.
// This complements agent-lifecycle.spec.ts (one deep interaction flow) with wide coverage: it is the
// net that catches a screen that 500s, throws on mount, or renders blank after a refactor.
//
// Only routes with no feature-flag gate in the nav are listed, so the suite passes in any environment
// (local dev, a fresh CI seed) regardless of which flags are on. Flag-gated screens (finance, approvals,
// environments, ...) get their own specs as those features grow.
const CORE_ROUTES: { path: string; label: string }[] = [
  { path: "/", label: "Home" },
  { path: "/search", label: "Search" },
  { path: "/timeline", label: "Timeline" },
  { path: "/agents", label: "Agents" },
  { path: "/projects", label: "Projects" },
  { path: "/artifacts", label: "Artifacts" },
  { path: "/adapter-plugins", label: "Adapter plugins" },
];

async function expectScreenRendered(page: Page, path: string) {
  const res = await page.goto(path);
  // A hard server failure (500) fails the screen outright.
  expect(res?.status(), `HTTP status for ${path}`).toBeLessThan(400);

  // The "Agents" nav label lives in the dashboard shell and renders on every authed page. Waiting for
  // it proves two things at once: the shell hydrated, and we were not redirected to /login. This is the
  // positive "screen mounted" signal that gives client-side data loads time to settle before the
  // error-boundary check below.
  await expect(page.getByText("Agents", { exact: true }).first()).toBeVisible();
  await expect(page).not.toHaveURL(/\/login/);

  // The dashboard error boundary renders an h2 "Something went wrong" (see app/(dashboard)/error.tsx).
  // Its absence means this screen did not throw on render.
  await expect(page.getByRole("heading", { name: /something went wrong/i })).toHaveCount(0);
}

test.describe("dashboard smoke", () => {
  for (const route of CORE_ROUTES) {
    test(`renders ${route.label} (${route.path})`, async ({ page }) => {
      await expectScreenRendered(page, route.path);
    });
  }
});
