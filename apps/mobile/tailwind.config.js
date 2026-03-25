/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        // Semantic tokens — mirrors useTheme light/dark palette
        app: {
          background: { DEFAULT: "#ffffff", dark: "#0f172a" },
          surface: { DEFAULT: "#f9fafb", dark: "#1e293b" },
          "surface-alt": { DEFAULT: "#f3f4f6", dark: "#334155" },
          border: { DEFAULT: "#e5e7eb", dark: "#334155" },
          "border-alt": { DEFAULT: "#f3f4f6", dark: "#1e293b" },
          text: { DEFAULT: "#111827", dark: "#f1f5f9" },
          "text-secondary": { DEFAULT: "#6b7280", dark: "#94a3b8" },
          "text-muted": { DEFAULT: "#9ca3af", dark: "#64748b" },
          accent: { DEFAULT: "#2563eb", dark: "#3b82f6" },
          "accent-surface": { DEFAULT: "#dbeafe", dark: "#1e3a5f" },
          "accent-text": { DEFAULT: "#1d4ed8", dark: "#93c5fd" },
          card: { DEFAULT: "#ffffff", dark: "#1e293b" },
          "input-bg": { DEFAULT: "#f9fafb", dark: "#1e293b" },
          icon: { DEFAULT: "#374151", dark: "#cbd5e1" },
          "icon-muted": { DEFAULT: "#9ca3af", dark: "#64748b" },
          "nav-icon-bg": { DEFAULT: "#f3f4f6", dark: "#334155" },
          divider: { DEFAULT: "#f3f4f6", dark: "#1e293b" },
        },
      },
    },
  },
  plugins: [],
};
