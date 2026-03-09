import { StyleSheet, View, FlatList, Text, TouchableOpacity } from "react-native";
import { useState, useEffect } from "react";
import { useRouter } from "expo-router";

interface Channel {
  id: string;
  name: string;
  unreadCount: number;
}

export default function ChannelsScreen() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchChannels = async () => {
      try {
        // TODO: Use urqlClient to fetch channels from GraphQL API
        setChannels([]);
      } catch (error) {
        console.error("Failed to fetch channels:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchChannels();
  }, []);

  const handleChannelPress = (channelId: string) => {
    router.push(`/channels/${channelId}`);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading channels...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {channels.length === 0 ? (
        <Text style={styles.emptyText}>No channels</Text>
      ) : (
        <FlatList
          data={channels}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.channelItem}
              onPress={() => handleChannelPress(item.id)}
            >
              <Text style={styles.channelName}>{item.name}</Text>
              {item.unreadCount > 0 && (
                <Text style={styles.unreadBadge}>{item.unreadCount}</Text>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#fff",
  },
  emptyText: {
    textAlign: "center",
    marginTop: 20,
    color: "#999",
  },
  channelItem: {
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  channelName: {
    fontSize: 16,
    fontWeight: "600",
  },
  unreadBadge: {
    backgroundColor: "#007AFF",
    color: "#fff",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: "600",
  },
});
