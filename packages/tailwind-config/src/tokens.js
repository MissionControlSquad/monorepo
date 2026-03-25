/**
 * AgentCenter design tokens — single source of truth for both web and native.
 *
 * Web (Tailwind v4):  import via globals.css  →  @theme CSS variables
 * Native (Tailwind v3 + NativeWind):  import via native.js  →  theme.extend
 */

/** Brand / accent */
const brand = {
  DEFAULT: "#2563eb", // blue-600
  hover: "#1d4ed8",   // blue-700
  muted: "#dbeafe",   // blue-100
  dark: "#3b82f6",    // blue-500  (dark mode default)
  "dark-hover": "#2563eb",
  "dark-muted": "#1e3a5f",
  text: "#1d4ed8",    // blue-700
  "dark-text": "#93c5fd", // blue-300
};

/** Semantic surface / text / border tokens */
const app = {
  bg:              { DEFAULT: "#ffffff",  dark: "#0f172a" },
  surface:         { DEFAULT: "#f9fafb",  dark: "#1e293b" },
  "surface-alt":   { DEFAULT: "#f3f4f6",  dark: "#334155" },
  border:          { DEFAULT: "#e5e7eb",  dark: "#334155" },
  "border-alt":    { DEFAULT: "#f3f4f6",  dark: "#1e293b" },
  text:            { DEFAULT: "#111827",  dark: "#f1f5f9" },
  "text-secondary":{ DEFAULT: "#6b7280",  dark: "#94a3b8" },
  "text-muted":    { DEFAULT: "#9ca3af",  dark: "#64748b" },
  card:            { DEFAULT: "#ffffff",  dark: "#1e293b" },
  "input-bg":      { DEFAULT: "#f9fafb",  dark: "#1e293b" },
  icon:            { DEFAULT: "#374151",  dark: "#cbd5e1" },
  "icon-muted":    { DEFAULT: "#9ca3af",  dark: "#64748b" },
  "nav-icon-bg":   { DEFAULT: "#f3f4f6",  dark: "#334155" },
  divider:         { DEFAULT: "#f3f4f6",  dark: "#1e293b" },
};

/** Status colours */
const status = {
  success:         "#16a34a",
  "success-muted": "#dcfce7",
  warning:         "#d97706",
  "warning-muted": "#fef3c7",
  danger:          "#dc2626",
  "danger-muted":  "#fee2e2",
};

/** Typography */
const fontFamily = {
  sans: ["Inter", "system-ui", "sans-serif"],
  mono: ["JetBrains Mono", "Menlo", "monospace"],
};

module.exports = { brand, app, status, fontFamily };
