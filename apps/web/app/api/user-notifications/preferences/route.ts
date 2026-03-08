export const dynamic = "force-dynamic";

import { prisma } from "@/server/prisma";
import { resolveUserId } from "../../_lib/resolve-session";
import { successResponse, handleError } from "../../_lib/json-response";
import { validateBody, updateNotificationPrefsSchema } from "../../_lib/validation";

export async function GET(request: Request) {
  try {
    const { userId } = await resolveUserId(request);

    const prefs = await prisma.userNotificationPreference.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

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

    const prefs = await prisma.userNotificationPreference.upsert({
      where: { userId },
      create: { userId, ...v.data },
      update: v.data,
    });

    return successResponse(prefs);
  } catch (err) {
    return handleError(err);
  }
}
