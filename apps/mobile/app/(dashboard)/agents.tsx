import { StyleSheet, View, FlatList, Text } from "react-native";
import { useState, useEffect } from "react";

interface Agent {
  id: string;
  name: string;
  status: "online" | "idle" | "offline";
}

export default function AgentsScreen() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        // TODO: Use urqlClient to fetch agents from GraphQL API
        setAgents([]);
      } catch (error) {
        console.error("Failed to fetch agents:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAgents();
  }, []);

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading agents...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {agents.length === 0 ? (
        <Text style={styles.emptyText}>No agents</Text>
      ) : (
        <FlatList
          data={agents}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.agentItem}>
              <Text style={styles.agentName}>{item.name}</Text>
              <Text style={[styles.status, styles[item.status]]}>
                {item.status}
              </Text>
            </View>
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
  agentItem: {
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  agentName: {
    fontSize: 16,
    fontWeight: "600",
  },
  status: {
    fontSize: 12,
    fontWeight: "600",
  },
  online: {
    color: "#34C759",
  },
  idle: {
    color: "#FF9500",
  },
  offline: {
    color: "#999",
  },
});
