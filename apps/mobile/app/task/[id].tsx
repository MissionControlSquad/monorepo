import { StyleSheet, View, Text, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useState, useEffect } from "react";

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTask = async () => {
      try {
        // TODO: Use urqlClient to fetch task details from GraphQL API
        setTask(null);
      } catch (error) {
        console.error("Failed to fetch task:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTask();
  }, [id]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Task {id}</Text>
      {task ? (
        <Text>Task details would go here</Text>
      ) : (
        <Text style={styles.emptyText}>Task not found</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 16,
  },
  emptyText: {
    color: "#999",
  },
});
