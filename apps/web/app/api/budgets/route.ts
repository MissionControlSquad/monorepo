export const dynamic = "force-dynamic";

import { prisma } from "@/server/prisma";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { FLAG_KEYS } from "@agentcenter/utils";
import type { BudgetScope, BudgetWindow } from "@agentcenter/database";
import { createBudgetPolicy } from "@/server/services/budgets";
import { withTenancy, serviceErrorResponse } from "../_lib/rest-tenancy";
import { successResponse, errorResponse } from "../_lib/json-response";

// Epic #4 R3: budget-policy CRUD over REST (parity with the GraphQL mutations), session-authenticated,
// workspace-scoped, admin-gated for writes. Auth + role + feature gate are handled by withTenancy; reads
// mirror the GraphQL query layer (direct prisma); writes funnel through the createBudgetPolicy service.

/** Declarative BUDGETS feature gate — 403 FEATURE_DISABLED "Budgets are not enabled" (shared by all verbs). */
const BUDGETS_FEATURE = { flag: FLAG_KEYS.BUDGETS, error: "Budgets are not enabled" } as const;

/** GET /api/budgets — list this workspace's budget policies (session + member). */
export const GET = withTenancy(
  async (_request, tenancy) => {
    try {
      const policies = await prisma.budgetPolicy.findMany({
        where: { workspaceId: tenancy.workspaceId },
        orderBy: { createdAt: "desc" },
      });
      return successResponse({ policies });
    } catch (err) {
      return serviceErrorResponse(err);
    }
  },
  { feature: BUDGETS_FEATURE },
);

/** POST /api/budgets — create a budget policy (session + admin). */
export const POST = withTenancy(
  async (request, tenancy) => {
    try {
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
  },
  { minRole: WORKSPACE_ROLES.ADMIN, feature: BUDGETS_FEATURE },
);
