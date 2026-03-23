import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNotificationCount } from "../hooks/useNotificationCount";

interface NotificationBellProps {
  onPress: () => void;
  color: string;
}

export function NotificationBell({ onPress, color }: NotificationBellProps) {
  const count = useNotificationCount();

  return (
    <TouchableOpacity onPress={onPress} style={{ padding: 8 }}>
      <View>
        <Ionicons name="notifications-outline" size={24} color={color} />
        {count > 0 && (
          <View
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: "#dc2626",
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: 3,
            }}
          >
            <Text style={{ fontSize: 9, color: "#fff", fontWeight: "700" }}>
              {count > 99 ? "99+" : String(count)}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}
