import { View, Text } from "react-native";

const PRIORITY_COLORS: Record<string, string> = {
  low: "#6b7280",
  medium: "#d97706",
  high: "#dc2626",
  urgent: "#7c3aed",
};

const PRIORITY_ICONS: Record<string, string> = {
  low: "↓",
  medium: "→",
  high: "↑",
  urgent: "⚡",
};

interface PriorityBadgeProps {
  priority: string;
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  const color = PRIORITY_COLORS[priority] ?? "#6b7280";
  const icon = PRIORITY_ICONS[priority] ?? "·";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
      <Text style={{ color, fontSize: 11, fontWeight: "700" }}>{icon}</Text>
      <Text style={{ color, fontSize: 11, fontWeight: "600", textTransform: "capitalize" }}>
        {priority}
      </Text>
    </View>
  );
}
