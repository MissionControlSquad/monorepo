export const dynamic = "force-dynamic";

import {
  getUserNotificationPreferences,
  saveUserNotificationPreferences,
} from "@agentcenter/database";
import { resolveUserId } from "../../_lib/resolve-session";
import { successResponse, handleError } from "../../_lib/json-response";
import { validateBody, updateNotificationPrefsSchema } from "../../_lib/validation";

export async function GET(request: Request) {
  try {
    const { userId } = await resolveUserId(request);

    const prefs = await getUserNotificationPreferences(userId);

    return successResponse(prefs);
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(request: Request) {
  try {
    const { userId } = await resolveUserId(request);
    const v = await validateBody(request, updateNotificationPrefsSchema);
    if (v.error) return v.error;

    const prefs = await saveUserNotificationPreferences(userId, v.data);

    return successResponse(prefs);
  } catch (err) {
    return handleError(err);
  }
}
