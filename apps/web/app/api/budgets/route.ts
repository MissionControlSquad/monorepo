export const dynamic = "force-dynamic";

import { prisma } from "@/server/prisma";
import { roleAtLeast } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { isFeatureEnabled } from "@/server/feature-flags";
import { FLAG_KEYS } from "@agentcenter/utils";
import type { BudgetScope, BudgetWindow } from "@agentcenter/database";
import { createBudgetPolicy } from "@/server/services/budgets";
import { resolveRestTenancy, serviceErrorResponse } from "../_lib/rest-tenancy";
import { successResponse, errorResponse } from "../_lib/json-response";

// Epic #4 R3: budget-policy CRUD over REST (parity with the GraphQL mutations), session-authenticated,
// workspace-scoped, admin-gated for writes. Reads mirror the GraphQL query layer (direct prisma);
// writes funnel through the createBudgetPolicy service.

/** GET /api/budgets — list this workspace's budget policies (session + member). */
export async function GET(request: Request) {
  try {
    if (!(await isFeatureEnabled(FLAG_KEYS.BUDGETS)))
      return errorResponse("Budgets are not enabled", 403, "FEATURE_DISABLED");
    const tenancy = await resolveRestTenancy(request);
    if (!tenancy) return errorResponse("Unauthenticated", 401, "UNAUTHENTICATED");

    const policies = await prisma.budgetPolicy.findMany({
      where: { workspaceId: tenancy.workspaceId },
      orderBy: { createdAt: "desc" },
    });
    return successResponse({ policies });
  } catch (err) {
    return serviceErrorResponse(err);
  }
}

/** POST /api/budgets — create a budget policy (session + admin). */
export async function POST(request: Request) {
  try {
    if (!(await isFeatureEnabled(FLAG_KEYS.BUDGETS)))
      return errorResponse("Budgets are not enabled", 403, "FEATURE_DISABLED");
    const tenancy = await resolveRestTenancy(request);
    if (!tenancy) return errorResponse("Unauthenticated", 401, "UNAUTHENTICATED");
    if (!roleAtLeast(tenancy.role, WORKSPACE_ROLES.ADMIN))
      return errorResponse("Requires 'admin' role", 403, "FORBIDDEN");

    const body = (await request.json().catch(() => ({}))) as {
      scope?: string;
      agentId?: string | null;
      name?: string;
      limitCents?: number;
      window?: string;
      hardStop?: boolean;
      warnPercent?: number | null;
    };
    if (!body.scope || !body.name || typeof body.limitCents !== "number" || !body.window)
      return errorResponse("scope, name, limitCents, window are required", 400, "BAD_REQUEST");

    const policy = await createBudgetPolicy({
      workspaceId: tenancy.workspaceId,
      scope: body.scope as BudgetScope,
      agentId: body.agentId ?? null,
      name: body.name,
      limitCents: body.limitCents,
      window: body.window as BudgetWindow,
      hardStop: body.hardStop ?? false,
      warnPercent: body.warnPercent ?? null,
    });
    return successResponse({ policy }, 201);
  } catch (err) {
    return serviceErrorResponse(err);
  }
}
