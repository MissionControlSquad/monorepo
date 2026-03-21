import {
  getOnboardingProgress,
  setOnboardingCategory,
  completeOnboarding,
} from "@/server/system-settings";
import { agentModel } from "@/server/models";
import { successResponse, handleError } from "../_lib/json-response";

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

/** PUT /api/onboarding — Save selected category */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { categoryId } = body as { categoryId?: string };
    if (categoryId) {
      await setOnboardingCategory(categoryId);
    }
    return successResponse({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/onboarding — Mark onboarding as completed */
export async function POST() {
  try {
    await completeOnboarding();
    return successResponse({ completed: true });
  } catch (err) {
    return handleError(err);
  }
}
