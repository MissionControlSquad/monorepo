import { View, Text } from "react-native";
import { PRIORITY_HEX_COLORS, PRIORITY_ICONS } from "@agentcenter/utils";

interface PriorityBadgeProps {
  priority: string;
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  const color = PRIORITY_HEX_COLORS[priority] ?? "#6b7280";
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
