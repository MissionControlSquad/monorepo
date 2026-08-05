# UI/E2E testing audit

Phase 1 inventory before adopting Playwright as the single UI/E2E framework.

## Findings

FOUND: no competing UI/E2E framework
  Category: N/A
  Evidence: no Cypress, Selenium, WebdriverIO, Nightwatch, TestCafe, Protractor, or `@storybook/test-runner` in any `package.json`.
  Blast radius: none. Clean slate for Playwright.

FOUND: puppeteer-core
  Category: REMOVE (superseded by Playwright)
  Evidence: root + `apps/web` devDependency. Used only for ad-hoc UI walkthrough scripts and a committed script at `apps/web/tests/e2e-ui/agent-lifecycle.mjs`. Not imported by any production code path (checked - no PDF/screenshot/scraping usage in `src`/`app`).
  Blast radius: only the ad-hoc scripts. Their real coverage (the agent lifecycle walkthrough) was migrated to `e2e/specs/agent-lifecycle.spec.ts` before removal.
  Proposed action: uninstall `puppeteer-core` from root and `apps/web`; delete `apps/web/tests/e2e-ui/`.
  Status: APPROVED and done.

KEEP: Vitest (230 test files)
  Category: KEEP (different layer)
  Evidence: `apps/web` unit + integration + API-level e2e tests (`tests/unit`, `tests/integration`, `tests/e2e`). These run in the `test` CI job.
  Rationale: not a browser UI framework. Playwright sits on top of this layer, it does not replace it.

## Follow-ups
- `data-testid` coverage is low (1 file). Add `data-testid` to key elements (create-agent, task cards, deliverables, approve/reject) so specs can use `getByTestId` instead of text/placeholder matching.
- Add a teardown/cleanup path for e2e-created agents + tasks in the shared `clawd`/`clawd_test` DB (currently specs use unique names to avoid collisions).
