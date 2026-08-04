export const dynamic = "force-dynamic";

import { prisma } from "@/server/prisma";
import { roleAtLeast } from "@/server/tenancy";
import { isFeatureEnabled } from "@/server/feature-flags";
import { FLAG_KEYS } from "@agentcenter/utils";
import type { BudgetWindow } from "@agentcenter/database";
import { updateBudgetPolicy, deleteBudgetPolicy } from "@/server/services/budgets";
import { resolveRestTenancy, serviceErrorResponse } from "../../_lib/rest-tenancy";
import { successResponse, errorResponse } from "../../_lib/json-response";

// Epic #4 R3: single budget-policy read/update/delete over REST. Session-authenticated, workspace-scoped;
// GET is member, PATCH/DELETE are admin. All operations filter by tenancy.workspaceId so one workspace
// can never touch another's policy (a missing/other-workspace id returns 404, not 403).
type Ctx = { params: Promise<{ id: string }> };

/** GET /api/budgets/:id (session + member). */
export async function GET(request: Request, ctx: Ctx) {
  try {
    if (!(await isFeatureEnabled(FLAG_KEYS.BUDGETS)))
      return errorResponse("Budgets are not enabled", 403, "FEATURE_DISABLED");
    const tenancy = await resolveRestTenancy(request);
    if (!tenancy) return errorResponse("Unauthenticated", 401, "UNAUTHENTICATED");
    const { id } = await ctx.params;

    const policy = await prisma.budgetPolicy.findFirst({
      where: { id, workspaceId: tenancy.workspaceId },
    });
    if (!policy) return errorResponse("Budget policy not found", 404, "NOT_FOUND");
    return successResponse({ policy });
  } catch (err) {
    return serviceErrorResponse(err);
  }
}

/** PATCH /api/budgets/:id (session + admin). */
export async function PATCH(request: Request, ctx: Ctx) {
  try {
    if (!(await isFeatureEnabled(FLAG_KEYS.BUDGETS)))
      return errorResponse("Budgets are not enabled", 403, "FEATURE_DISABLED");
    const tenancy = await resolveRestTenancy(request);
    if (!tenancy) return errorResponse("Unauthenticated", 401, "UNAUTHENTICATED");
    if (!roleAtLeast(tenancy.role, "admin"))
      return errorResponse("Requires 'admin' role", 403, "FORBIDDEN");
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
}

/** DELETE /api/budgets/:id (session + admin). */
export async function DELETE(request: Request, ctx: Ctx) {
  try {
    if (!(await isFeatureEnabled(FLAG_KEYS.BUDGETS)))
      return errorResponse("Budgets are not enabled", 403, "FEATURE_DISABLED");
    const tenancy = await resolveRestTenancy(request);
    if (!tenancy) return errorResponse("Unauthenticated", 401, "UNAUTHENTICATED");
    if (!roleAtLeast(tenancy.role, "admin"))
      return errorResponse("Requires 'admin' role", 403, "FORBIDDEN");
    const { id } = await ctx.params;

    const ok = await deleteBudgetPolicy(tenancy.workspaceId, id);
    if (!ok) return errorResponse("Budget policy not found", 404, "NOT_FOUND");
    return successResponse({ ok: true });
  } catch (err) {
    return serviceErrorResponse(err);
  }
}
