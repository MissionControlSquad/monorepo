# SKILL.md — {{agent.role}} Guide

How {{agent.name}} works. This is your craft — the standards and methodology for your role.

## Your Capabilities
{{capabilities}}

## React / Next.js Patterns

**Server vs Client Components:**
- Default to Server Components. Only add `"use client"` when you need interactivity (event handlers, hooks, browser APIs)
- Fetch data directly in async Server Components — no `useEffect` waterfalls
- Use `<Suspense>` boundaries for streaming/progressive rendering of slow sections
- Server Actions (`'use server'`) for form submissions and mutations with server-side validation

**Data Fetching:**
- `fetch(url, { next: { revalidate: N } })` for ISR
- `{ cache: 'no-store' }` for SSR
- `{ next: { tags: ['key'] } }` + `revalidateTag()` for on-demand revalidation
- Avoid fetch waterfalls — prefetch data during navigation

**State Management (layered):**
- Server state: TanStack Query or SWR (never store server data in global client state)
- UI state: Zustand for lightweight stores (modals, sidebar, selections)
- Form state: React Hook Form + Zod for validation
- Context: only for relatively static data (theme, auth, locale) — not frequently-changing values

**Layout & Routing:**
- `layout.tsx` for shared persistent UI, `loading.tsx` for Suspense fallbacks, `error.tsx` for error boundaries
- Route groups `(groupName)` to organize without affecting URLs
- Parallel routes for device-specific experiences

## TypeScript Discipline

**Strict Config:** `strict: true`, `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`

**Key Patterns:**
- Discriminated unions with a `type`/`status`/`kind` literal for exhaustive switch:
  ```typescript
  type Result<T> = { status: 'success'; data: T } | { status: 'error'; error: Error } | { status: 'loading' };
  ```
- Branded types for semantically different values: `type UserId = string & { __brand: 'UserId' }`
- `satisfies` to validate types while preserving narrow inference
- `as const` for literal tuple/object types
- Constrain generics: `<T extends { id: string }>` — not open `<T>`
- Template literal types for API endpoint validation: `type Endpoint = \`/api/${string}\``

## Component Architecture

**Composition over configuration:**
- Compound Components for coordinated children (Tabs, Select, Accordion): parent manages state via Context, children consume
- Slots pattern: pass components as props (`header={<Header />}`) for flexibility
- Headless components (logic hooks) paired with presentation components
- Co-locate files: `ComponentName/index.tsx`, `ComponentName.test.tsx`

**Rules:**
- Break components at single-responsibility boundaries — no 200+ line components
- No prop drilling beyond 2 levels — extract a Context or restructure
- Error Boundaries (`error.tsx`) for graceful rendering failure recovery

## CSS / Tailwind

- Mobile-first: base styles for mobile, `sm:` / `md:` / `lg:` for larger screens
- Semantic token names (`--color-primary`, `--color-danger`) — never raw hex values in components
- `clsx` or `cva` (class-variance-authority) for conditional/variant class logic
- Extract repeated class strings into React components, not CSS abstractions
- Dark mode: `dark:` variant with CSS variable-based theming
- Use `@apply` sparingly — only for highly repeated patterns

## Accessibility (WCAG 2.2)

**Semantic HTML first:**
- `<button>` not `<div onClick>` for interactive elements
- `<label htmlFor>` explicitly associated with form controls
- Use `<nav>`, `<main>`, `<header>`, `<footer>`, `<section>`, `<article>`, `<dialog>`

**Keyboard:**
- All interactive elements: Tab, Enter, Space, Escape, arrow keys
- No keyboard traps — users must navigate in and out of everything
- Visible focus indicators: `focus-visible:ring-2 focus-visible:ring-blue-500`
- Roving tabindex for composite widgets (tab lists, menus, toolbars)
- Trap focus inside modal dialogs. Return focus to trigger on close.

**ARIA:**
- Use accessible component libraries: Radix UI, React Aria, Headless UI
- Follow WAI-ARIA APG patterns for dialogs, comboboxes, tabs, tree views
- `aria-live` for dynamic content announcements
- "No ARIA is better than bad ARIA" — prefer semantic HTML first

## Performance

**Core Web Vitals Targets:**
- **LCP** < 2.5s — optimize hero images, `next/image` with `priority` for above-the-fold, preload fonts
- **INP** < 200ms — `useTransition` for heavy state updates, no synchronous expensive computations on main thread
- **CLS** < 0.1 — explicit dimensions on images/videos, `placeholder="blur"`, reserve space for dynamic content

**Bundle:**
- `next/dynamic` for heavy components not needed on initial load
- `React.lazy()` + `<Suspense>` for client-side code splitting
- `next/image` with `sizes` for responsive images; `next/font` for zero-CLS font loading

**Memoization (profile first):**
- `useMemo` for expensive computations, `useCallback` for stable refs to memoized children
- `React.memo` for components that re-render with unchanged props
- Don't prematurely optimize — use React DevTools Profiler first

## Testing

**Stack:** Vitest + React Testing Library for unit/integration. Playwright for E2E.

**Philosophy:**
- Test user behavior, not implementation — query by role, label, placeholder, not by class/test ID
- MSW (Mock Service Worker) for API mocking at the boundary
- `jest-axe` / axe-core for automated accessibility checks
- E2E: cover critical paths only (auth, core flows, form submissions). Keep < 5 min in CI.

## Anti-Patterns to Avoid
- Array index as `key` in dynamic lists
- Mutating state directly (`state.items.push(x)`)
- Missing deps in `useEffect` arrays (stale closures)
- Inline objects/functions in JSX causing unnecessary re-renders
- `useEffect` for data fetching (prefer Server Components or TanStack Query)
- Storing derived state (computable from other state/props)
- `<div onClick>` when `<button>` is correct
- Missing loading/error states for async operations

## How You Work (Non-Negotiable)
- **Read before you write.** Read the task description, parent task, upstream deliverables, and messages before starting.
- **Don't work on blocked tasks.** If `blockedByTaskId` is set and that task isn't done, pick a different task.
- **Ask for clarification, don't guess.** Post a question and move on. A quick question saves a rejection later.
- **Reference related work.** When building on another task's output, say so in your deliverable.
- **Unblock others first.** If your task blocks a teammate, prioritize it.
- **Self-review before submitting.** Check against every acceptance criterion.
- **Flag scope creep.** If the task is bigger than described, say so.
- **Raise risks early.** Flag risky approaches or missing dependencies immediately.
- **Ship when done, not when perfect.** Meets acceptance criteria? Submit it.
- **Learn from rejections.** Read feedback, update MEMORY.md.

## Teamwork
- **React to teammates' work.** Thumbs-up, heart, party — costs nothing, builds trust.
- **Check for existing work.** Read deliverables on related tasks before building something new.
- **Proactive updates.** If taking longer than expected, post a message before the deadline.

## Before Submitting
- [ ] Code compiles without errors or warnings
- [ ] Server Components used where possible (no unnecessary `"use client"`)
- [ ] TypeScript strict — no `any`, proper discriminated unions
- [ ] Tested on mobile and desktop viewports
- [ ] Keyboard navigation works, focus management correct
- [ ] No console errors or warnings
- [ ] Component handles edge cases (empty data, long strings, loading, error)
- [ ] Follows existing codebase patterns and conventions
- [ ] Bundle impact considered (dynamic imports for heavy deps)

---

_This file is yours to evolve. As you learn what works, update it._
