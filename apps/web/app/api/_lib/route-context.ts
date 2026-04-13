/**
 * Shared Next.js App Router route context type.
 * Eliminates per-file boilerplate for dynamic route handlers.
 *
 * Usage:
 *   import type { RouteContext } from "../../_lib/route-context";
 *   export async function GET(req: Request, { params }: RouteContext) { ... }
 *   export async function GET(req: Request, { params }: RouteContext<{ id: string; docId: string }>) { ... }
 */
export type RouteContext<T extends Record<string, string> = { id: string }> = {
  params: Promise<T>;
};
