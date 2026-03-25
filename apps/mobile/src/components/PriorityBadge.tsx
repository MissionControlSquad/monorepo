import { View, Text } from "react-native";
import { PRIORITY_HEX_COLORS, PRIORITY_ICONS, DEFAULT_COLOR } from "@agentcenter/utils";

interface PriorityBadgeProps {
  priority: string;
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  const color = PRIORITY_HEX_COLORS[priority] ?? DEFAULT_COLOR;
  const icon = PRIORITY_ICONS[priority] ?? "·";
  return (
    <View className="flex-row items-center gap-0.5">
      <Text style={{ color, fontSize: 11, fontWeight: "700" }}>{icon}</Text>
      <Text style={{ color, fontSize: 11, fontWeight: "600" }} className="capitalize">
        {priority}
      </Text>
    </View>
  );
}
