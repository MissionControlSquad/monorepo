import { StyleSheet, View, FlatList, Text, TouchableOpacity } from "react-native";
import { useState, useEffect } from "react";
import { useRouter } from "expo-router";
import { urqlClient } from "../../src/api/client";

// Mock task type for now
interface Task {
  id: string;
  title: string;
  status: "inbox" | "assigned" | "in_progress" | "review" | "done";
}

export default function TaskListScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        // TODO: Use urqlClient to fetch tasks from GraphQL API
        setTasks([]);
      } catch (error) {
        console.error("Failed to fetch tasks:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();
  }, []);

  const handleTaskPress = (taskId: string) => {
    router.push(`/task/${taskId}`);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading tasks...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {tasks.length === 0 ? (
        <Text style={styles.emptyText}>No tasks yet</Text>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.taskItem}
              onPress={() => handleTaskPress(item.id)}
            >
              <Text style={styles.taskTitle}>{item.title}</Text>
              <Text style={styles.taskStatus}>{item.status}</Text>
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
  taskItem: {
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    padding: 12,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  taskStatus: {
    fontSize: 12,
    color: "#999",
    marginTop: 4,
  },
});
