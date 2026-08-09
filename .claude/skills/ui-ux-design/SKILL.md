---
name: ui-ux-design
description: >
  UI/UX rules for building or changing any AgentCenter screen (web dashboard or mobile) — reuse the
  existing design system, gate by role/feature, and ship complete states. Use before writing any
  frontend component, page, or flow. Pair with the frontend-design and web-design-guidelines skills
  for visual quality.
---

# UI/UX design

Build screens that look and behave like one product. Reuse; don't reinvent.

## System reuse (non-negotiable)

- **One UI kit.** Reuse shadcn components under `apps/web/src/components/ui/shadcn`, the Tailwind
  config/tokens, and the existing status/priority token system. Do **not** add a second component
  library or ad-hoc colors — use tokens.
- Match the existing **dashboard shell** (nav, layout, spacing) for new pages under
  `apps/web/app/(dashboard)/`.
- Charts: use the **dataviz** skill (consistent palette, light+dark, accessible). Never hand-roll chart
  colors.

## Every screen ships

- **All states:** loading, empty, error, and success — never a blank flash or an unhandled error.
- **Responsive:** works mobile + desktop; wide content (tables, diagrams) scrolls inside its own
  container, the page never scrolls horizontally.
- **Accessible:** keyboard-navigable, focus states, labels/aria, sufficient contrast in light AND dark.
- **Gated:** nav items and actions wrapped in `<WhenWorkspaceRoles roles={[...]}>` + the relevant
  buildbase feature flag; a `member` sees read-only, an `admin` sees manage controls (D3).
- **Mobile parity:** if the product exposes the feature on mobile, add the `apps/mobile` screen too
  (read-only at minimum).

## Interaction quality

- Optimistic where safe; otherwise show pending state. Confirm destructive/high-blast-radius actions
  (e.g. workspace-wide budget hard-stop, deleting a secret that breaks running agents — list what
  breaks).
- Live data via the existing graphql-ws subscriptions (e.g. `budgetIncidentChanged`, `approvalChanged`).
- Copy is clear and specific; surface `FEATURE_DISABLED`/`PLAN_LIMIT_EXCEEDED`/`FORBIDDEN` as readable
  messages, not raw errors.

## Before done

- [ ] Uses shadcn + tokens only; no new kit/colors.
- [ ] Loading + empty + error + success states.
- [ ] Responsive + keyboard-accessible + light/dark.
- [ ] Role + feature gated; mobile parity where applicable.
- [ ] For product-UI decisions, back the design with real references (use Lazyweb / design-best-practices).
