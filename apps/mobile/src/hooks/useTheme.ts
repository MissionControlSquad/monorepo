import { useColorScheme } from "react-native";

const light = {
  background: "#ffffff",
  surface: "#f9fafb",
  surfaceAlt: "#f3f4f6",
  border: "#e5e7eb",
  borderAlt: "#f3f4f6",
  text: "#111827",
  textSecondary: "#6b7280",
  textMuted: "#9ca3af",
  accent: "#2563eb",
  accentSurface: "#dbeafe",
  accentText: "#1d4ed8",
  danger: "#dc2626",
  dangerSurface: "#fee2e2",
  success: "#16a34a",
  successSurface: "#dcfce7",
  warning: "#d97706",
  warningSurface: "#fef3c7",
  card: "#ffffff",
  inputBg: "#f9fafb",
  placeholder: "#9ca3af",
  icon: "#374151",
  iconMuted: "#9ca3af",
  navIconBg: "#f3f4f6",
  divider: "#f3f4f6",
  shadow: "#000000",
  headerBg: "#ffffff",
  tabBar: "#ffffff",
};

const dark = {
  background: "#0f172a",
  surface: "#1e293b",
  surfaceAlt: "#334155",
  border: "#334155",
  borderAlt: "#1e293b",
  text: "#f1f5f9",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  accent: "#3b82f6",
  accentSurface: "#1e3a5f",
  accentText: "#93c5fd",
  danger: "#f87171",
  dangerSurface: "#450a0a",
  success: "#4ade80",
  successSurface: "#052e16",
  warning: "#fbbf24",
  warningSurface: "#451a03",
  card: "#1e293b",
  inputBg: "#1e293b",
  placeholder: "#64748b",
  icon: "#cbd5e1",
  iconMuted: "#64748b",
  navIconBg: "#334155",
  divider: "#1e293b",
  shadow: "#000000",
  headerBg: "#0f172a",
  tabBar: "#0f172a",
};

export type Theme = typeof light;

export function useTheme(): { colors: Theme; isDark: boolean } {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  return { colors: isDark ? dark : light, isDark };
}
