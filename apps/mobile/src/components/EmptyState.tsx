import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../hooks/useTheme";

interface EmptyStateProps {
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  message: string;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({ icon = "cube-outline", message, action }: EmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 12, padding: 32 }}>
      <Ionicons name={icon} size={48} color={colors.iconMuted} />
      <Text style={{ color: colors.textMuted, fontSize: 15, textAlign: "center", lineHeight: 22 }}>
        {message}
      </Text>
      {action && (
        <TouchableOpacity
          style={{ backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, marginTop: 4 }}
          onPress={action.onPress}
        >
          <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>{action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
