import { View, Text, StyleSheet } from "react-native";
import { STATUS_HEX_COLORS, DEFAULT_COLOR, humanizeLabel } from "@agentcenter/utils";

interface StatusPillProps {
  status: string;
  size?: "sm" | "md";
}

export function StatusPill({ status, size = "sm" }: StatusPillProps) {
  const color = STATUS_HEX_COLORS[status] ?? DEFAULT_COLOR;
  return (
    <View style={[styles.pill, { backgroundColor: color + "22" }]}>
      <Text
        style={[
          styles.text,
          { color, fontSize: size === "sm" ? 11 : 13 },
        ]}
      >
        {humanizeLabel(status)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  text: {
    fontWeight: "600",
  },
});
