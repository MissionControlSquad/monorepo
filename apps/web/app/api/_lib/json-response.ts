import { NextResponse } from "next/server";
import { captureError } from "@/server/error-tracking";

export function successResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Catch-all error handler for route handlers.
 * Handles thrown { error, status } objects from resolveAgent
 * and generic Error instances.
 *
 * For 4xx errors (from resolveAgent etc.), the message is safe to expose.
 * For 5xx errors, a generic message is returned to avoid leaking internals.
 */
export function handleError(err: unknown) {
  if (err && typeof err === "object" && "error" in err && "status" in err) {
    const e = err as { error: string; status: number };
    return errorResponse(e.error, e.status);
  }
  captureError(err);
  return errorResponse("Internal server error", 500);
}
