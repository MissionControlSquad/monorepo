import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Component / render tests for React client components (jsdom).
 *
 * Separate from the node-env unit + integration configs because rendering React needs a DOM
 * (jsdom) and the JSX/Fast-Refresh transform (@vitejs/plugin-react). Only `"use client"` components
 * are renderable here — Server Components (async/RSC) are covered by Playwright instead.
 *
 * Usage: npx vitest run -c vitest.components.config.ts   (or: npm run test:components)
 */
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup-components.ts"],
    include: ["tests/components/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
