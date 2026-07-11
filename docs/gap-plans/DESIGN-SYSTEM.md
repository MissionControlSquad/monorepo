# DESIGN-SYSTEM — UI rules for AgentCenter

Referenced by `CONVENTIONS.md §5` and the `ui-ux-design` skill. Any new/changed UI MUST follow this.
**Reuse the existing system — do not introduce a second UI kit, ad-hoc colors, or one-off spacing.**

## Where the system lives (read these before building UI)

- **shadcn primitives:** `apps/web/src/components/ui/shadcn/*` — `button`, `card`, `dialog`,
  `alert-dialog`, `select`, `dropdown-menu`, `popover`, `sheet`, `switch`, `checkbox`, `form`, `input`,
  `label`, `textarea`, `breadcrumb`, `badge`. Compose from these.
- **App components (prefer these over raw shadcn):** `apps/web/src/components/ui/*` — `Button`, `Card`,
  `Badge`, `Input`, `FormField`, `EmptyState`, `ConfirmDialog`, `Breadcrumbs`, `DueDatePill`,
  `StatusPill`, `PrioritySelect`, `AvatarCropDialog`.
- **Tokens / theme:** `apps/web/tailwind.config.js` + `apps/web/app/globals.css`. Use Tailwind classes
  bound to these tokens — **never** hardcode hex/rgb or arbitrary px. Light + dark are both defined; test both.
- **Status / priority language:** reuse `StatusPill.tsx`, `PrioritySelect.tsx`, `AgentStatusBadge.tsx`,
  `StatusHistoryTimeline.tsx`. New statuses/priorities extend these — do not invent a parallel scheme.
- **Charts:** the `dataviz` skill (consistent categorical palette, light+dark, accessible). Never
  hand-pick chart colors.

## Mandatory states (every screen)

- **Loading** — skeleton/spinner, never a blank flash.
- **Empty** — use `EmptyState` with a clear message + primary action (if the user can act).
- **Error** — readable message; surface `FEATURE_DISABLED` / `PLAN_LIMIT_EXCEEDED` / `FORBIDDEN` /
  `NOT_FOUND` as human copy, not raw GraphQL errors.
- **Success** — the populated view.

## Layout & responsiveness

- New dashboard pages live under `apps/web/app/(dashboard)/` and match the existing shell (nav, header,
  spacing rhythm). Use the app `Card`/`Breadcrumbs` for structure.
- Responsive: works mobile → desktop. Wide content (tables, charts, code) scrolls inside its own
  `overflow-x-auto` container; the page body never scrolls horizontally.
- Mobile parity: if the feature is exposed on mobile, add the `apps/mobile/app/*` screen (read-only at
  minimum for viewer roles).

## Accessibility (non-negotiable)

- Keyboard navigable; visible focus states; correct labels/`aria-*` on inputs and interactive elements.
- Contrast passes in **both** light and dark. Don't rely on color alone (pair with icon/text).
- Dialogs trap focus and restore it on close (shadcn `dialog`/`alert-dialog` already do — use them).

## Gating (ties to buildbase RBAC + features)

- Wrap nav items and manage/mutate actions in `<WhenWorkspaceRoles roles={['admin','owner']}>` and the
  relevant buildbase feature flag. A `member` sees read-only; an `admin` sees manage controls (D3).
- Destructive / high-blast-radius actions use `ConfirmDialog` and **list what breaks** (e.g. "deleting
  this secret will break 3 running agents"; "workspace-wide budget hard-stop pauses all agents").

## Interaction quality

- Optimistic updates where safe; otherwise show a pending state. Live data via the existing graphql-ws
  subscriptions (`approvalChanged`, `budgetIncidentChanged`, …).
- Copy: specific, action-oriented, consistent tense. No lorem, no raw enum values in the UI.

## Per-UI-change checklist (part of the implementation loop)

- [ ] Built from shadcn + app components + tokens only; no new kit, no hardcoded colors/px.
- [ ] Loading + empty + error + success states.
- [ ] Responsive (no horizontal body scroll) + keyboard-accessible + light/dark contrast.
- [ ] Role- and feature-gated; destructive actions confirmed with impact listed.
- [ ] Mobile screen added where the product exposes the feature.
- [ ] Charts via `dataviz`; statuses/priorities via the existing pills.
- [ ] For product-shape decisions, backed by real references (Lazyweb / design-best-practices skills).
