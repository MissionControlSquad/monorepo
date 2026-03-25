import { View, Text } from "react-native";
import { STATUS_HEX_COLORS, DEFAULT_COLOR, humanizeLabel } from "@agentcenter/utils";

interface StatusPillProps {
  status: string;
  size?: "sm" | "md";
}

export function StatusPill({ status, size = "sm" }: StatusPillProps) {
  const color = STATUS_HEX_COLORS[status] ?? DEFAULT_COLOR;
  return (
    <View
      className="rounded px-1.5 py-0.5 self-start"
      style={{ backgroundColor: color + "22" }}
    >
      <Text className="font-semibold" style={{ color, fontSize: size === "sm" ? 11 : 13 }}>
        {humanizeLabel(status)}
      </Text>
    </View>
  );
}
