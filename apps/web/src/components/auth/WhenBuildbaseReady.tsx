"use client";

import type { ReactNode } from "react";
import { useBuildbaseReady } from "@/components/providers/BuildbaseProvider";

/**
 * Renders children only once the buildbase SDK provider is ready; otherwise renders `fallback`
 * (default null). Replaces the repeated `const ready = useBuildbaseReady(); if (!ready) return null`
 * guard. Pass `fallback={children}` for the dormant-safe passthrough variant (render regardless until
 * the SDK is configured), the way WhenAdmin does.
 */
export function WhenBuildbaseReady({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return useBuildbaseReady() ? <>{children}</> : <>{fallback}</>;
}
