export const dynamic = "force-dynamic";

import { prisma } from "@/server/prisma";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { FLAG_KEYS } from "@agentcenter/utils";
import type { BudgetWindow } from "@agentcenter/database";
import { updateBudgetPolicy, deleteBudgetPolicy } from "@/server/services/budgets";
import { withTenancy, serviceErrorResponse } from "../../_lib/rest-tenancy";
import { successResponse, errorResponse } from "../../_lib/json-response";

// Epic #4 R3: single budget-policy read/update/delete over REST. Auth + role + feature gate via
// withTenancy; GET is member, PATCH/DELETE are admin. All operations filter by tenancy.workspaceId so one
// workspace can never touch another's policy (a missing/other-workspace id returns 404, not 403).
type Ctx = { params: Promise<{ id: string }> };

/** Declarative BUDGETS feature gate — 403 FEATURE_DISABLED "Budgets are not enabled" (shared by all verbs). */
const BUDGETS_FEATURE = { flag: FLAG_KEYS.BUDGETS, error: "Budgets are not enabled" } as const;

/** GET /api/budgets/:id (session + member). */
export const GET = withTenancy(
  async (_request, tenancy, ctx: Ctx) => {
    try {
      const { id } = await ctx.params;

      const policy = await prisma.budgetPolicy.findFirst({
        where: { id, workspaceId: tenancy.workspaceId },
      });
      if (!policy) return errorResponse("Budget policy not found", 404, "NOT_FOUND");
      return successResponse({ policy });
    } catch (err) {
      return serviceErrorResponse(err);
    }
  },
  { feature: BUDGETS_FEATURE },
);

/** PATCH /api/budgets/:id (session + admin). */
export const PATCH = withTenancy(
  async (request, tenancy, ctx: Ctx) => {
    try {
      const { id } = await ctx.params;

      const body = (await request.json().catch(() => ({}))) as {
        name?: string | null;
        limitCents?: number | null;
        window?: string | null;
        hardStop?: boolean | null;
        isActive?: boolean | null;
      };

      const policy = await updateBudgetPolicy({
        workspaceId: tenancy.workspaceId,
        id,
        name: body.name ?? null,
        limitCents: body.limitCents ?? null,
        window: (body.window as BudgetWindow | null) ?? null,
        hardStop: body.hardStop ?? null,
        isActive: body.isActive ?? null,
      });
      return successResponse({ policy });
    } catch (err) {
      return serviceErrorResponse(err);
    }
  },
  { minRole: WORKSPACE_ROLES.ADMIN, feature: BUDGETS_FEATURE },
);

/** DELETE /api/budgets/:id (session + admin). */
export const DELETE = withTenancy(
  async (_request, tenancy, ctx: Ctx) => {
    try {
      const { id } = await ctx.params;

      const ok = await deleteBudgetPolicy(tenancy.workspaceId, id);
      if (!ok) return errorResponse("Budget policy not found", 404, "NOT_FOUND");
      return successResponse({ ok: true });
    } catch (err) {
      return serviceErrorResponse(err);
    }
  },
  { minRole: WORKSPACE_ROLES.ADMIN, feature: BUDGETS_FEATURE },
);
