import { View, Text, StyleSheet } from "react-native";

const STATUS_COLORS: Record<string, string> = {
  // Task
  inbox: "#6b7280",
  assigned: "#2563eb",
  in_progress: "#d97706",
  review: "#7c3aed",
  done: "#16a34a",
  blocked: "#dc2626",
  // Agent
  active: "#16a34a",
  idle: "#6b7280",
  deactivated: "#9ca3af",
  // Project
  archived: "#9ca3af",
  paused: "#d97706",
  // Queue
  pending: "#6b7280",
  completed: "#16a34a",
  failed: "#dc2626",
  cancelled: "#9ca3af",
};

function capLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface StatusPillProps {
  status: string;
  size?: "sm" | "md";
}

export function StatusPill({ status, size = "sm" }: StatusPillProps) {
  const color = STATUS_COLORS[status] ?? "#6b7280";
  return (
    <View style={[styles.pill, { backgroundColor: color + "22" }]}>
      <Text
        style={[
          styles.text,
          { color, fontSize: size === "sm" ? 11 : 13 },
        ]}
      >
        {capLabel(status)}
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
