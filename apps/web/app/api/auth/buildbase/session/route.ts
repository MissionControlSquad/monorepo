import { NextRequest } from "next/server";
import { BB_SESSION_COOKIE, readCookie } from "@/server/tenancy/buildbase";

// Returns the buildbase session id from the httpOnly cookie (Epic #1). Called by the SDK's
// getSession callback on page refresh. Ported from the MissionControlSquad website.
export async function GET(request: NextRequest) {
  const sessionId = readCookie(request.headers.get("Cookie"), BB_SESSION_COOKIE);
  return Response.json({ sessionId: sessionId || null });
}
