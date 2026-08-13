# RBAC Audit — AgentCenter (web)

**Status:** Audit + report. Read-only except (a) this document and (b) minimal fixes for
unambiguous server-side security gaps (sensitive mutations with **no** role gate). See §C.6.

**Scope:** Human role-based access control for the workspace/team model
(owner / admin / member / viewer). Agent authorization (`agent-authz`, apiKeyHash) is a
separate axis (D2) and out of scope here.

**Key decision needed from the product owner:** the **member = read-only** problem for teams
(§D). Today an invited `member` can do *nothing* but read. That blocks the entire team use
case. §D proposes a concrete role→capability matrix to approve. **We did not change
`ROLE_CAPS`** — that is a product decision.

---

## A. Buildbase-owned capabilities — CONSUME, do not rebuild

Buildbase (`@buildbase/sdk`) is the identity + membership + role + billing provider. The app
**consumes** these; it must never reimplement member management, invites, billing, roles
assignment, quota, credits, push, sessions, devices, or workspace settings.

Role flow: buildbase → `bb-workspace-token` JWT (`userRole` claim) →
`resolveTenancy` / `mapRole` (`apps/web/src/server/tenancy/resolve.ts`) →
`ctx.tenancy.role` + `ctx.tenancy.can()`.

Canonical list confirmed in `docs/gap-plans/01-buildbase-tenancy.md` (table "What buildbase
provides") and the `buildbase` / `buildbase-tenancy` skills.

| Capability area | SDK hook / screen the app uses | Where |
| --- | --- | --- |
| Auth / login (OAuth console) | `useSaaSAuth().signIn`, `SaaSOSProvider`, `WhenAuthenticated/WhenUnauthenticated` | `apps/web/app/(auth)/login/page.tsx`; `apps/web/src/components/providers/BuildbaseProvider.tsx`; `apps/web/src/components/layout/AccountMenuSlot.tsx` |
| Server session bridge / factory | `BuildBase({serverUrl,orgId,getSessionId})`, `bb.withSession(id).auth()/.workspace.list()/.users.getProfile()` | `apps/web/src/server/tenancy/buildbase.ts`; `apps/web/src/server/auth/buildbase-bridge.ts`; `apps/web/app/api/auth/buildbase/sso/route.ts` |
| Members & invites / role assignment | `openWorkspaceSettings('users')` (SDK members screen); server `users.{invite,remove,updateRole}` | `apps/web/src/components/settings/BuildbaseAccountCard.tsx`; `apps/web/src/components/layout/AccountMenuSlot.tsx` |
| RBAC gating (role/permission) | `WhenWorkspaceRoles`, `WhenPermission`, `usePermissions().can`, `Permission` const | `apps/web/src/components/auth/WhenAdmin.tsx`; `WhenPermission.tsx`; `BuildbaseAccountCard.tsx` |
| Billing / plans / trials | `useSubscriptionManagement(workspaceId)`, `useTrialStatus()`, `openPlanPicker`, `openWorkspaceSettings('subscription')` | `apps/web/src/views/BillingPage.tsx`; `PricingView.tsx`; `apps/web/src/lib/buildbase-billing.ts` |
| Credits | `useSaaSAuth().openCreditStore` | `apps/web/src/components/layout/AccountMenuSlot.tsx`; `BillingPage.tsx` |
| Metered quota | `useQuotaUsageStatus`, `useAllQuotaUsage`, `useUsageLogs`; server `usage.record` | `apps/web/src/components/usage/QuotaGate.tsx`, `QuotaIndicator.tsx`, `UsageOverview.tsx`; `apps/web/src/server/tenancy/usage.ts` |
| Push notifications | `usePushNotifications()`; server `bb.notification.send(...)`; `PushApi` in provider | `apps/web/src/components/settings/PushNotificationsCard.tsx`; `apps/web/src/server/services/notification-buildbase.ts` |
| Sessions / devices / passkeys | `openWorkspaceSettings('security')` (SDK screen), `WorkspaceApi` | `apps/web/src/components/account/AccountPasskeysCard.tsx`; `apps/web/src/views/AccountSecurityPage.tsx` |
| Workspace settings / switcher | `useSaaSWorkspaces()`, `openWorkspaceSettings()`, `WorkspaceSwitcher` slot | `apps/web/src/components/providers/WorkspaceSwitcherSlot.tsx`; `BuildbaseAccountCard.tsx`; `SettingsPage.tsx` |
| Per-VPS licensing | buildbase Installation (`INSTALLATION_ID`) | `apps/web/src/server/env.ts`; doc |

Buildbase-owned permission constants the app references (do **not** rebuild):
`WORKSPACE_MEMBERS_INVITE/REMOVE/ROLE/VIEW`, `WORKSPACE_BILLING_MANAGE/VIEW`,
`WORKSPACE_SETTINGS_EDIT/VIEW`, and `members:invite/remove/role-change/view`.

> Confirmed correct: the app owns **no** member/invite/billing/role-assignment mutation of its
> own. There is no `inviteMember`, `removeMember`, `changeMemberRole`, `createInvoice`, etc. in
> `apps/web/src/server/graphql/mutations/`. Good — nothing to remove.

---

## B. Our role → capability model

Defined in `apps/web/src/server/tenancy/roles.ts`, enforced by
`apps/web/src/server/tenancy/guards.ts`.

**Role hierarchy (`RANK`):** `viewer(0) < member(1) < admin(2) < owner(3)`.

**Capability map (`ROLE_CAPS`) — current:**

| role | caps |
| --- | --- |
| owner | `["*"]` |
| admin | `["*"]` |
| member | `["read"]` |
| viewer | `["read"]` |

**Helpers:**
- `roleAtLeast(role, min)` — hierarchy comparison. This is what actually gates the server today.
- `roleCan(role, permission)` — consults `ROLE_CAPS`; `"*"` grants all. Backs `ctx.tenancy.can()`
  and `requirePermission`. **Currently the only fine-grained permission ever checked is
  `read`**, so `roleCan` effectively means "admin/owner = everything, member/viewer = read".
- `requireRole(ctx, min)` — throws `FORBIDDEN` unless `roleAtLeast`. **This is the primary gate**
  used across mutations (see §C).
- `requireTenancy(ctx)` — throws `UNAUTHENTICATED` if no human tenancy.
- `scoped(ctx, where)` — injects `workspaceId` for workspace isolation (D5, separate axis).

**Observation:** server enforcement is done almost entirely with `requireRole(ctx, "admin")` and
`requireRole(ctx, "member")` — a two-tier "manage vs operate" split — even though `ROLE_CAPS`
collapses member to read-only. So the *intent* in the mutation layer is already "member can
operate"; only `ROLE_CAPS` (and the UI, §E) disagree. The `member` requireRole gates were
written anticipating an operate-capable member. See §D.

---

## C. Server-side gating audit (GraphQL mutations)

Method: classified all 80 files in `apps/web/src/server/graphql/mutations/` by the
`requireRole` tier used per mutation field. Counts: **138 `requireRole(ctx,"admin")`**,
**93 `requireRole(ctx,"member")`** across 61 files. 19 files call no role gate — most are
operate/self/agent surfaces (see C.5); two contained genuinely sensitive ungated mutations
(C.6, **fixed**).

### C.1 Admin/owner-only modules (fully `requireRole(ctx,"admin")`) — correct

These are "manage / govern / configure" surfaces. Gate is correct.

| module | representative actions | gate | correct? |
| --- | --- | --- | --- |
| `secrets.ts` | createSecret, createSecretProvider, deleteSecretProvider, rotateManagedSecret, checkSecretProviderHealth | admin (manage); member (bind/rotate/unbind/update own-use) | ✅ |
| `finance.ts` | createBudgetPolicy, updateBudgetPolicy, deleteBudgetPolicy, resolveBudgetIncident, raiseBudgetAndResume, setAgentSalary, ingestFinanceEvent | admin; member for ingest/reprice cost events | ✅ |
| `environments.ts` | all 11 (create/update/delete/snapshot/rollback/supersede) | admin | ✅ |
| `agent-authz.ts`, `agent-governance.ts`, `agent-companies.ts`, `agent-memory.ts`, `agent-runtime.ts`, `agent-skills-sync.ts` | agent config / governance / memory writes | admin | ✅ |
| `api-keys.ts` | createApiKey, revokeApiKey | admin | ✅ |
| `plugins.ts`, `plugin-grants.ts`, `adapters.ts`, `adapter-plugins.ts` | install/config/grant | admin | ✅ |
| `runner-hosts.ts`, `runner-commands.ts`, `terminals.ts`, `sandbox-run.ts`, `local-services.ts`, `workspace-runtime-services.ts`, `execution-workspaces.ts`, `cloud-upstreams.ts`, `live-gateway-devices.ts` | infra / execution targets | admin | ✅ |
| `ledger.ts`, `folders.ts`, `monitors.ts`, `smoke-lab.ts`, `inbox-policies.ts`, `board-principals.ts`, `portability.ts`, `ai-runtime.ts` | governance / infra | admin | ✅ |

### C.2 Mixed manage/operate modules — `admin` for manage, `member` for operate

| module | admin (manage) | member (operate) | correct? |
| --- | --- | --- | --- |
| `approvals.ts` (10) | approve/reject/requestChanges/castVote | createApproval/resubmit/request* | ✅ |
| `approval-policies.ts` (3) | create/update policy | evaluate | ✅ |
| `pipelines.ts` (18) | 10 admin (define/config) | 8 member (run/step) | ✅ (spot-checked) |
| `task-autonomy.ts` (14) | 8 admin (policy) | 6 member (operate) | ✅ |
| `skills.ts` (16), `skill-lifecycle.ts` (6) | publish/lifecycle admin | author/comment member | ✅ |
| `cases.ts` (9), `agents.ts` (8), `assets.ts` (3), `reviews.ts` (4), `secret-proposals.ts` (3), `user-secrets.ts` (3), `work-products.ts` (3), `boardroom.ts` (2), `cli-auth.ts` (2) | — | mixed | ✅ (tier matches action) |

### C.3 Member-operate modules (`requireRole(ctx,"member")`) — correct *intent*

`agent-instructions.ts`, `attention.ts`, `deliverable-votes.ts`, `document-annotations.ts`,
`external-objects.ts`, `feedback.ts`, `goals.ts`, `org-chart.ts`, `project-doc-comments.ts`,
`skill-comments.ts`, `task-attachments.ts`, `task-labels.ts`, `sidebar-preferences.ts`.

These require `member` — i.e. the code *assumes members can operate*. **But `ROLE_CAPS` gives
member only `read`**, and `requireRole` uses `roleAtLeast` (rank), so a `member` (rank 1) DOES
pass `requireRole(ctx,"member")`. So these work for members today. The break is where UI/product
still treats member as read-only. See §D.

### C.4 `agents.ts` — note

`agents.ts` has 8 mutation fields but only 1 admin + 2 member gates visible; the remaining
create/hire/fire paths route through the **approvals** workflow (`requestAgentHire` →
`approveApproval`, which is admin-gated in `approvals.ts`/`graphql-governance.test.ts`). Agent
*hire/fire* is therefore admin-gated end-to-end. ✅ Confirmed via existing governance test.

### C.5 Ungated files that are **acceptable** (operate / self / agent-auth)

These call no `requireRole`, and that is defensible:

| file | why acceptable |
| --- | --- |
| `tasks.ts`, `messages.ts`, `channels.ts`, `deliverables.ts`, `deliverable-annotations.ts`, `documents.ts`, `project-docs.ts`, `recurring-tasks.ts`, `task-templates.ts`, `task-relations.ts`, `external-links.ts`, `message-reactions.ts` | **operate**-level actions any team member should perform. Leaving them ungated is what lets members work today. Gating these is exactly the §D matrix decision — **do not** gate without product sign-off (would either lock members out or need the operate cap). |
| `profile.ts` (updateMyProfile), `notifications.ts`, `sidebar-preferences.ts` | **self**-scoped to `ctx.session.profileId`. |
| `agent-actions.ts`, `agent-queue.ts`, `events.ts` (`ingestEvent`) | **agent**-facing; `ingestEvent` authenticates with an `apiKey` arg (separate agent-auth path), not human tenancy. |

> ⚠️ Separate (non-role) note: several of these operate/self files also do not call `scoped()`
> or `requireTenancy()`, so they rely on args (taskId, workspaceId, etc.) rather than the JWT for
> workspace isolation. That is a **workspace-isolation** concern (D5), a different axis from
> role-gating and outside this audit's fix scope. Flagged for a follow-up isolation pass.

### C.6 Ungated **sensitive** mutations — REAL GAPS (FIXED)

Two files contained sensitive mutations reachable with **no role gate at all**. Fixed minimally
with `requireRole(ctx,"admin")` (the correct manage tier), plus tests. Under the single-tenant
bootstrap fallback the logged-in admin resolves to `owner`, so self-host behavior is preserved;
in a multi-tenant workspace only admin/owner can now perform these.

| module | action | before | risk | fix |
| --- | --- | --- | --- | --- |
| `feature-flags.ts` | `updateFeatureFlag` | **no gate** (only a `managedBy !== "user"` check) | any authenticated member/viewer could flip user-managed feature flags (governance/config) | `requireRole(ctx,"admin")` |
| `system.ts` | `setSystemShutdown` | **no auth at all** — even anonymous | global kill-switch flip → DoS | `requireRole(ctx,"admin")` |
| `system.ts` | `setProjectShutdown` | **no auth at all** — even anonymous | project kill-switch flip | `requireRole(ctx,"admin")` |
| `system.ts` | `generatePasswordResetLink` | only `ctx.session?.sub` (any authenticated session) | **account takeover**: any signed-in user could mint a reset link for **any** admin user | `requireRole(ctx,"admin")` (session check retained) |

`system.ts` `changePassword` was **already** safe (self-service; verifies current password) — not
changed.

**Tests added / updated:**
- `apps/web/tests/unit/graphql-feature-flags.test.ts` — updated mutation cases to authenticate as
  admin; added member-denied and unauthenticated-denied cases.
- `apps/web/tests/unit/graphql-system-guards.test.ts` (new) — `setSystemShutdown` denies
  anonymous + member, allows admin.

**Follow-up recommendation (not fixed — architecture decision):** `system.ts` actions are
*global*, but `requireRole(ctx,"admin")` grants them to *any workspace admin*. In a true
multi-tenant deployment, global kill-switches and cross-admin password resets should be gated to a
platform super-admin, not a per-workspace admin. Current fix removes the anonymous/any-user hole;
tightening to super-admin is a separate decision.

---

### C.7 REST routes (`apps/web/app/api/**`)

Audited the sensitive/mutating routes. **No REST route with missing auth was found.** Guards in
use: agent apiKey (`resolveAgent` + `assertProjectMember`/`assertProjectLead`/`squadLeadRequired`),
human session (`resolveSession`), and cron secret (`Bearer ${CRON_SECRET}`).

| route | guard | gap? |
| --- | --- | --- |
| `api/feature-flags/invalidate` | `CRON_SECRET` header | OK |
| `api/channels` (GET) | `resolveAgent`, read-only | OK |
| `api/recurring-tasks` + `[id]` (+pause/resume) | `resolveAgent` + `assertProjectMember` | OK |
| `api/tasks/[id]` (+approve/reject) | `resolveAgent` + `assertProjectMember` + `squadLeadRequired` + shutdown checks | OK |
| `api/projects/[id]/members` | `resolveAgent` + `assertProjectLead` | OK |
| `api/support/bug-report` | `resolveSession` (human) | OK (auth); see note |
| `runner/*`, `agents/me/*` | agent apiKey | OK |
| `cron/*` | `CRON_SECRET` header | OK |

> Non-auth note (P2 follow-up, not a role issue): `api/support/bug-report/route.ts` interpolates
> user-supplied `screenshotBase64` into email HTML without the `escapeHtml` used on other fields —
> an injection surface worth a separate fix. Auth is present.

---

## D. The `member = read-only` problem for teams — ✅ APPLIED

> **APPLIED** (`feat/member-operate-rbac`). The team role→capability matrix below is approved and
> implemented: `ROLE_CAPS.member = ["read","operate"]` (owner/admin stay `["*"]`, viewer stays
> `["read"]`); `roleCan` now resolves operate-class permissions true for members and manage-class
> false (fail-safe on unknown perms). Server `requireRole` gates already enforced the two-tier split
> (no gate changes needed — audit confirmed correct). UI: the highest-value manage controls (§E rows
> 1–4, 7, 8, 11, 12) are now wrapped in `WhenAdmin`. Matrix proved by
> `apps/web/tests/unit/rbac-member-operate.test.ts`.


**Problem.** `ROLE_CAPS.member = ["read"]`. `ctx.tenancy.can(perm)` only ever returns true for
`read`. For a **team** (multiple invited users per workspace), this means an invited `member`
cannot do operational work *anywhere `can()` / a permission gate is used*, and the UI (§E) hides
manage actions for non-admins. The requireRole *server* gates already admit members (rank-based),
so the inconsistency is: **requireRole says "members operate", but `ROLE_CAPS`/`can()`/UI say
"members read only".** For teams this is wrong — a member should be able to create tasks, run
agents, post messages, submit deliverables, comment, vote, etc.

**Team role → capability matrix (APPROVED + APPLIED).**
Split capabilities into **operate** (do the work) vs **manage** (secrets, budgets, governance,
workspace/infra config, deletes).

| role | capability set |
| --- | --- |
| owner | everything (`*`) |
| admin | everything (`*`) — manage + operate |
| **member** | **operate**: create/run/message/deliver/comment/vote + `read` |
| viewer | `read` only |

Concretely, `ROLE_CAPS.member` would become something like
`["read", "operate"]` (or explicit: `["read","task:write","message:write","deliverable:write",
"agent:run","comment:write","vote","skill:author"]`), and operate-tier surfaces would check
`can("operate")` / stay on `requireRole("member")`. **Manage** stays `admin`:

| stays **admin/owner** (manage) | modules |
| --- | --- |
| secrets & providers | `secrets.ts` (create/provider/rotateManaged) |
| budgets / finance policy | `finance.ts` |
| governance / approval policy | `approvals.ts` (approve/vote), `approval-policies.ts`, `agent-governance.ts` |
| workspace/infra config | `environments.ts`, `runner-hosts.ts`, `plugins*`, `adapters*`, `cloud-upstreams.ts`, `execution-workspaces.ts`, `local-services.ts`, `workspace-runtime-services.ts`, `live-gateway-devices.ts`, `monitors.ts`, `ledger.ts`, `folders.ts` |
| api keys | `api-keys.ts` |
| kill switches / flags | `system.ts`, `feature-flags.ts` (now admin-gated, §C.6) |
| agent hire/fire | via approvals (admin) |
| destructive deletes of shared config | the `delete*` admin mutations above |

| becomes **member** (operate) | modules |
| --- | --- |
| tasks / recurring / templates / relations / labels / attachments | `tasks.ts`, `recurring-tasks.ts`, `task-templates.ts`, `task-relations.ts`, `task-labels.ts`, `task-attachments.ts` |
| messaging / channels / reactions | `messages.ts`, `channels.ts`, `message-reactions.ts` |
| deliverables + annotations + votes | `deliverables.ts`, `deliverable-annotations.ts`, `deliverable-votes.ts` |
| documents / project-docs / comments | `documents.ts`, `project-docs.ts`, `project-doc-comments.ts`, `document-annotations.ts` |
| goals / cases / reviews / feedback / attention / org-chart | `goals.ts`, `cases.ts`, `reviews.ts`, `feedback.ts`, `attention.ts`, `org-chart.ts` |
| skills authoring + comments | `skills.ts` (author), `skill-comments.ts` |
| run agents / pipelines (execute, not configure) | `agents.ts` run paths, `pipelines.ts` run steps, `task-autonomy.ts` operate |

**What actually changes if approved:** only `ROLE_CAPS.member` in
`apps/web/src/server/tenancy/roles.ts` (+ any UI `WhenPermission("operate")` gates in §E). The
server `requireRole("member")` gates already permit members — so most of the matrix is *already
enforced correctly at the mutation layer*; the real fix is `ROLE_CAPS` + UI. **This is the
decision to approve.**

---

## E. UI role-awareness audit

_(Filled from UI sweep — see §E table below.)_

Guards available:
- `WhenWorkspaceRoles` (`@buildbase/sdk/react`) — role membership.
- `WhenAdmin` (`apps/web/src/components/auth/WhenAdmin.tsx`) — owner/admin; **dormant-safe**
  (renders children until buildbase provisioned; server stays the security floor).
- `WhenPermission` (`apps/web/src/components/auth/WhenPermission.tsx`) — specific permission,
  falls back to `WhenAdmin` while dormant.
- `usePermissions` (`@buildbase/sdk/react`).

**Design note:** because `WhenAdmin`/`WhenPermission` are *dormant-safe*, adding them can never
regress current behavior — while buildbase is unprovisioned they render children, and the server
guard (§C) remains the real enforcement. So UI gates are purely UX (don't show actions the user
can't perform) and are safe to add incrementally.

**Already gated (the only 3 consumers today):**
- `apps/web/src/components/secrets/MySecretsPanel.tsx` — `WhenAdmin` around secret create/delete.
- `apps/web/src/components/secrets/SecretProposalsPanel.tsx` — `WhenAdmin`.
- `apps/web/src/views/MemoryInspectPage.tsx` — role guard.

No file uses `WhenWorkspaceRoles` directly except inside `WhenAdmin`.

**Prioritized UI controls that SHOULD gate but DON'T** (recommend `WhenAdmin` / `WhenPermission`;
the server is already the enforcement floor per §C, so these are UX only):

| # | file | mutation (control) | needed gate |
| --- | --- | --- | --- |
| 1 | `apps/web/src/views/SettingsPage.tsx` (system shutdown button) | `SET_SYSTEM_SHUTDOWN` | admin/owner |
| 2 | `apps/web/src/views/SettingsPage.tsx` (`FeatureFlagsCard`) | `UPDATE_FEATURE_FLAG` | admin/owner |
| 3 | `apps/web/src/views/SettingsPage.tsx` (governance mode) | `SET_AGENT_GOVERNANCE` | admin/owner |
| 4 | `apps/web/src/components/settings/ApprovalPoliciesCard.tsx` | `SET_APPROVAL_POLICY`, `DELETE_APPROVAL_POLICY` | admin |
| 5 | `apps/web/src/components/dialogs/SecretDialog.tsx` | `CREATE_SECRET` (workspace) | admin (member for own user-secret) |
| 6 | `apps/web/src/components/dialogs/BudgetPolicyDialog.tsx` | `CREATE_BUDGET_POLICY` | admin |
| 7 | `apps/web/src/components/finance/FinanceEventsSection.tsx` | `REPRICE_COST_EVENT`, `INGEST_FINANCE_EVENT` | admin |
| 8 | `apps/web/src/views/PluginDetailPage.tsx` | `UNINSTALL_PLUGIN`, `SET_PLUGIN_ENABLED`, `GRANT/REVOKE_PLUGIN_CAPABILITY` | admin |
| 9 | `apps/web/src/components/dialogs/RunnerHostDialog.tsx` | `CREATE_RUNNER_HOST` | admin |
| 10 | `apps/web/src/components/dialogs/EnvironmentDialog.tsx` | `CREATE_ENVIRONMENT` | admin |
| 11 | `apps/web/src/views/AgentsPage.tsx` | `SET_AGENT_ACTIVATION` (hire/retire agent) | admin |
| 12 | `apps/web/src/components/channels/ChannelInfoSidebar.tsx` | `DELETE_CHANNEL`, `REMOVE_CHANNEL_MEMBER` | admin (member to leave) |

Runner-ups: `LiveGatewayPage.tsx` (`APPROVE/REVOKE_LIVE_GATEWAY_DEVICE`), `PluginInstallDialog.tsx`
(`INSTALL_PLUGIN`), `AgentEditPage.tsx` (`UPDATE_AGENT_PROFILE`) — all admin.

> Not mass-editing these (recommendation per task). They are UX polish, not security — §C is the
> enforcement floor. Highest value: rows 1–3 (the Settings admin surface).

---

## F. Gaps & recommendations — punch-list

**P0 — server security gaps (FIXED in this PR):**
1. `updateFeatureFlag` — added `requireRole(ctx,"admin")`. ✅
2. `setSystemShutdown` / `setProjectShutdown` — added `requireRole(ctx,"admin")` (were fully
   unauthenticated). ✅
3. `generatePasswordResetLink` — added `requireRole(ctx,"admin")` (was any-session → account
   takeover). ✅

**P0 — decision the user must make:**
4. ✅ **APPLIED — team role→capability matrix (§D).** `ROLE_CAPS.member = ["read","operate"]` +
   `roleCan` operate/manage classification + §E UI gates (rows 1–4, 7, 8, 11, 12). Server mutation
   gates already assumed operate-capable members (no gate changes). Covered by
   `apps/web/tests/unit/rbac-member-operate.test.ts`.

**P1 — follow-ups (not fixed here):**
5. Gate global `system.ts` kill-switches to a **platform super-admin**, not any workspace admin
   (§C.6 follow-up).
6. **Workspace isolation** pass for the operate/self mutation files that don't call `scoped()` /
   `requireTenancy()` (§C.5 note) — separate D5 axis.
7. UI role gates from §E — add `WhenAdmin`/`WhenPermission` to the destructive/manage controls so
   member/viewer don't see actions they can't perform (dormant-safe, incremental). Start with the
   Settings admin surface (§E rows 1–3).

**P2 — hygiene (not a role issue):**
9. `api/support/bug-report/route.ts` — escape `screenshotBase64` before HTML interpolation (§C.7).

**Confirmed correct — buildbase-owned, nothing to build:**
8. No app-side member/invite/billing/role-assignment/quota/credits mutations exist. The app
   correctly consumes buildbase for all of §A.
</content>
