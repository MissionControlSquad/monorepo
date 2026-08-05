# E2E testing (Playwright)

Playwright is the single UI/E2E framework for this monorepo. Specs run identically on a dev machine
and in GitHub Actions. Unit/integration tests stay in Vitest (`npm test`); Playwright is the browser
layer on top.

## One-time setup (fresh clone)

```bash
npm install
npm run e2e:install          # downloads the pinned Chromium
cp e2e/.env.example e2e/.env # then set ADMIN_PASSWORD
```

Locally the specs reuse whatever app + DB you already run for dev. Have the app on `http://localhost:3000`
(`npm run dev`) with a logged-in-able admin, then:

```bash
npm run e2e                  # run everything (headless)
npm run e2e:ui               # interactive UI mode
npm run e2e:headed           # watch it in a real browser
npm run e2e -- specs/agent-lifecycle.spec.ts   # a single file
npm run e2e -- --grep @smoke                    # a tag subset
npm run e2e:report           # open the last HTML report
npm run e2e:codegen          # record selectors against the running app
```

Locally, if no server is running on :3000, Playwright boots one via the `webServer` config.

## Layout

```
e2e/
  playwright.config.ts   # chromium; reuses a running dev server locally, boots one in CI
  setup/auth.setup.ts    # logs in once, saves storageState (.auth/admin.json)
  specs/                 # the tests
  .auth/  .results/      # gitignored, regenerated each run
```

## Conventions (enforce these)

- **Selector priority:** `getByRole` > `getByLabel` > `getByText` > `getByTestId` > CSS. Never XPath, never Tailwind class-name selectors. Add `data-testid` where semantic selectors are not available.
- **Web-first assertions only:** `await expect(locator).toBeVisible()` (auto-retries). Never `expect(await locator.isVisible()).toBe(true)`.
- **No arbitrary waits.** No `waitForTimeout`/`sleep`. Use `expect(...)`, `waitForURL`, `waitForResponse`, `expect.poll`.
- **Setup through the API, assert through the UI.** Seed state with the app's API instead of clicking through five screens; assert the one thing under test in the UI.
- **Tag tests** for subsets: `@smoke @p0 @agents @billing`, etc.
- **One behavior per test. No shared mutable state.** Each test creates what it needs (use a unique suffix so parallel runs on the shared DB do not collide).

## What is covered

- `agent-lifecycle.spec.ts` (P0): create an agent through the wizard UI, the agent loads its role skill
  + full config set from the cloud, it works a task and submits a deliverable, the squad lead requests
  rework then approves, the task lands `done`. Human steps go through the UI; the agent's own runtime
  steps go through its Bearer-key REST API (no human performs those).

More specs (budget auto-pause, company/project/task, cloud-skills) to follow.

## Debugging a failure

- `npm run e2e:ui` - step through interactively.
- On failure, a trace + video + screenshot are written under `e2e/.results/`. Open a trace with
  `npx playwright show-trace <path>`.
- In CI, download the `playwright-report` artifact from the run.

## CI

`.github/workflows/e2e.yaml` boots postgres + redis, migrates, seeds an admin + squad, builds and
starts the app, installs Chromium, and runs the specs. Trigger it from the Actions tab
(`workflow_dispatch`, optional `grep` filter) or on pushes touching `apps/web`/`e2e`.
