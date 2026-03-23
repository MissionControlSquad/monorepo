import { View, Text, Image, StyleSheet } from "react-native";
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
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      >
        <Text style={{ fontSize: size * 0.5 }}>{emoji}</Text>
      </View>
    );
  }

  const initials = generateInitials(displayName);

  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={{ fontSize: size * 0.35, fontWeight: "700", color: "#1d4ed8" }}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: "#dbeafe",
    justifyContent: "center",
    alignItems: "center",
  },
});
