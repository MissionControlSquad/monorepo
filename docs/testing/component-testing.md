# Component / render testing (Vitest + React Testing Library)

The unit-level UI layer: render one **client** component in jsdom and assert what a user sees. This sits
between the node-env unit tests (`npm test`, pure logic + resolvers + real DB) and Playwright
(`npm run e2e`, real browser, full flows).

## When to use which layer

| Layer | Tool | Runs in | Use for |
|-------|------|---------|---------|
| Logic / API / resolver | Vitest (node) | node | pure functions, GraphQL/REST handlers, DB behavior |
| **Component / render** | **Vitest + RTL** | **jsdom** | a `"use client"` component's states, gating, interaction |
| E2E / visual | Playwright | real Chromium | full user journeys, Server Components/pages, screenshots |

**Hard boundary:** only `"use client"` components render here. Server Components (async/RSC — most
`app/**/page.tsx`) cannot be unit-rendered; cover those with Playwright.

## Setup (already wired in `apps/web`)

- Config: `vitest.components.config.ts` — `environment: "jsdom"`, `@vitejs/plugin-react`, setup file.
- Setup: `tests/setup-components.ts` — jest-dom matchers + `cleanup()` after each test.
- Tests live in `tests/components/**/*.test.tsx` (note the **`.tsx`** — the node config globs only
  `*.test.ts`, so the two suites never collide).
- Dev deps: `@testing-library/react@16` (React 19), `@testing-library/user-event`,
  `@testing-library/jest-dom`, `jsdom`, `@vitejs/plugin-react`.

```bash
npm run test:components --workspace @agentcenter/web
```

## Writing a test

Query by **role/label/text** (what the user and the screen reader see), never by CSS class — the same
discipline Playwright and AI test authors rely on.

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

render(<MyCard />);
expect(screen.getByRole("heading", { name: "Plan features" })).toBeInTheDocument();
await userEvent.click(screen.getByRole("button", { name: "Save" }));
```

### Mocking the boundaries (buildbase + Next)

- **buildbase SDK** — `vi.mock("@buildbase/sdk/react", …)`. Dormant-safe gates (`WhenAdmin`,
  `QuotaGate`) render children without it; SDK-driven cards need a stub. See
  `tests/components/when-admin.test.tsx` for the pattern (control `useBuildbaseReady`, stub the SDK
  role gate, assert delegation).
- **`next/navigation`** — stub `useSearchParams`/`useRouter` (see
  `tests/components/billing-return-view.test.tsx`).
- **`next/link`** — render as a plain `<a>` (no router context in jsdom).
- **urql / GraphQL** — wrap in a `Provider` with a mock client, or intercept with MSW (add `msw` when
  a component's data-loading needs it).

## The rest of the repo

- **`packages/hooks`, `packages/graphql-client`** (React) can reuse this same jsdom config.
- **`apps/mobile`** is Expo/React Native — a **different** stack (`@testing-library/react-native` +
  `jest-expo`), set up separately when needed. Do **not** point RTL/jsdom at it.
- All other `packages/*` are node-only and stay on the existing Vitest.

See `README.md` (this folder) for the Playwright E2E layer.
