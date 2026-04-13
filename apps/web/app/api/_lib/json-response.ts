import { NextResponse } from "next/server";
import { captureError } from "@/server/error-tracking";

/**
 * Assert that a value is non-null/undefined, throwing a structured 404 that
 * handleError() converts to a proper error response. Use after findById():
 *
 *   const task = await taskModel.findById(id);
 *   assertFound(task, ERR.TASK_NOT_FOUND);
 *   // task is now T (non-null), 404 thrown if missing
 */
export function assertFound<T>(value: T | null | undefined, message: string): asserts value is T {
  if (value == null) {
    throw { error: message, status: 404 };
  }
}

export function successResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Return a structured error response.
 * `code` is a machine-readable constant (e.g. "NOT_FOUND", "RATE_LIMITED")
 * that clients can switch on without parsing the human-readable `error` string.
 */
export function errorResponse(message: string, status = 500, code?: string) {
  return NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status });
}

/**
 * Catch-all error handler for route handlers.
 * Handles thrown { error, status, code? } objects from resolveAgent / resolveSession
 * and generic Error instances.
 *
 * For 4xx errors (from resolveAgent etc.), the message is safe to expose.
 * For 5xx errors, a generic message is returned to avoid leaking internals.
 */
export function handleError(err: unknown) {
  if (err && typeof err === "object" && "error" in err && "status" in err) {
    const e = err as { error: string; status: number; code?: string };
    return errorResponse(e.error, e.status, e.code);
  }
  captureError(err);
  return errorResponse("Internal server error", 500, "INTERNAL_ERROR");
}
