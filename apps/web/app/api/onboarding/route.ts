import {
  getOnboardingProgress,
  setOnboardingCategory,
  completeOnboarding,
} from "@/server/system-settings";
import { agentModel } from "@/server/models";
import { successResponse, handleError } from "../_lib/json-response";
import { validateBody, onboardingCategorySchema } from "../_lib/validation";
import { withTenancy } from "../_lib/rest-tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";

/**
 * GET /api/onboarding — Get onboarding progress.
 * Auto-completes onboarding if agents already exist in the DB.
 */
export async function GET() {
  try {
    const progress = await getOnboardingProgress();

    if (!progress.completed) {
      const agentCount = await agentModel.count();
      if (agentCount > 0) {
        await completeOnboarding();
        return successResponse({ completed: true, categoryId: null });
      }
    }

    return successResponse(progress);
  } catch (err) {
    return handleError(err);
  }
}

/** PUT /api/onboarding — Save selected category (human ADMIN; previously unauthenticated). */
export const PUT = withTenancy(
  async (request) => {
    try {
      const v = await validateBody(request, onboardingCategorySchema);
      if (v.error) return v.error;
      if (v.data.categoryId) {
        await setOnboardingCategory(v.data.categoryId);
      }
      return successResponse({ ok: true });
    } catch (err) {
      return handleError(err);
    }
  },
  { minRole: WORKSPACE_ROLES.ADMIN },
);

/** POST /api/onboarding — Mark onboarding as completed (human ADMIN; previously unauthenticated). */
export const POST = withTenancy(
  async () => {
    try {
      await completeOnboarding();
      return successResponse({ completed: true });
    } catch (err) {
      return handleError(err);
    }
  },
  { minRole: WORKSPACE_ROLES.ADMIN },
);
