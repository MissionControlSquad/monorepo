import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface EmptyStateProps {
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  message: string;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({ icon = "cube-outline", message, action }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={48} color="#d1d5db" />
      <Text style={styles.message}>{message}</Text>
      {action && (
        <TouchableOpacity style={styles.actionBtn} onPress={action.onPress}>
          <Text style={styles.actionText}>{action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    padding: 32,
  },
  message: {
    color: "#9ca3af",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  actionBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 4,
  },
  actionText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
});
