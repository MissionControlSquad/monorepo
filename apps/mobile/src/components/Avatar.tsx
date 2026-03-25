import { View, Text, Image } from "react-native";
import { useAuth } from "../context/AuthContext";
import { generateInitials } from "@agentcenter/utils";

interface AvatarProps {
  avatarUrl?: string | null;
  displayName: string;
  size?: number;
  emoji?: string | null;
}

export function Avatar({ avatarUrl, displayName, size = 32, emoji }: AvatarProps) {
  const { serverUrl } = useAuth();

  if (avatarUrl) {
    const uri = avatarUrl.startsWith("http")
      ? avatarUrl
      : `${serverUrl ?? ""}${avatarUrl}`;
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }

  if (emoji) {
    return (
      <View
        className="bg-blue-100 dark:bg-blue-900/30 justify-center items-center"
        style={{ width: size, height: size, borderRadius: size / 2 }}
      >
        <Text style={{ fontSize: size * 0.5 }}>{emoji}</Text>
      </View>
    );
  }

  const initials = generateInitials(displayName);

  return (
    <View
      className="bg-blue-100 dark:bg-blue-900/30 justify-center items-center"
      style={{ width: size, height: size, borderRadius: size / 2 }}
    >
      <Text
        className="font-bold text-blue-700 dark:text-blue-300"
        style={{ fontSize: size * 0.35 }}
      >
        {initials}
      </Text>
    </View>
  );
}
