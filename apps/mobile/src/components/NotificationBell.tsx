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
    <TouchableOpacity onPress={onPress} className="p-2">
      <View>
        <Ionicons name="notifications-outline" size={24} color={color} />
        {count > 0 && (
          <View className="absolute -top-0.5 -right-0.5 min-w-4 h-4 rounded-full bg-red-600 justify-center items-center px-1">
            <Text className="text-xs text-white font-bold">
              {count > 99 ? "99+" : String(count)}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}
