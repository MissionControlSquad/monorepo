import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
} from "react-native";
import { styled } from "nativewind";
import { useRouter } from "expo-router";
import { useState } from "react";

const StyledView = styled(View);
const StyledText = styled(Text);
const StyledScrollView = styled(ScrollView);
const StyledTouchableOpacity = styled(TouchableOpacity);

type Task = {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed";
  dueDate: string;
  priority: "low" | "medium" | "high";
};

const MOCK_TASKS: Task[] = [
  {
    id: "1",
    title: "Setup Expo Router",
    description: "Configure file-based routing",
    status: "in_progress",
    dueDate: "2026-03-15",
    priority: "high",
  },
  {
    id: "2",
    title: "Implement Auth Flow",
    description: "Login and register screens",
    status: "pending",
    dueDate: "2026-03-18",
    priority: "high",
  },
  {
    id: "3",
    title: "Create Task List Screen",
    description: "Display and manage tasks",
    status: "pending",
    dueDate: "2026-03-20",
    priority: "medium",
  },
];

export default function TasksScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "pending" | "in_progress" | "completed">(
    "all"
  );

  const filteredTasks =
    filter === "all" ? MOCK_TASKS : MOCK_TASKS.filter((t) => t.status === filter);

  const getPriorityColor = (priority: Task["priority"]) => {
    switch (priority) {
      case "high":
        return "bg-red-100";
      case "medium":
        return "bg-yellow-100";
      case "low":
        return "bg-green-100";
    }
  };

  const getStatusColor = (status: Task["status"]) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-600";
      case "in_progress":
        return "bg-blue-100 text-blue-600";
      case "pending":
        return "bg-gray-100 text-gray-600";
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <StyledView className="px-4 py-4 border-b border-gray-200">
        <StyledText className="text-2xl font-bold text-black mb-4">
          Tasks
        </StyledText>

        {/* Filter Buttons */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {["all", "pending", "in_progress", "completed"].map((f) => (
            <StyledTouchableOpacity
              key={f}
              onPress={() => setFilter(f as any)}
              className={`mr-3 px-4 py-2 rounded-full ${
                filter === f
                  ? "bg-blue-600"
                  : "bg-gray-100"
              }`}
            >
              <StyledText
                className={`capitalize font-semibold ${
                  filter === f ? "text-white" : "text-gray-700"
                }`}
              >
                {f.replace("_", " ")}
              </StyledText>
            </StyledTouchableOpacity>
          ))}
        </ScrollView>
      </StyledView>

      <FlatList
        data={filteredTasks}
        keyExtractor={(item) => item.id}
        renderItem={({ item: task }) => (
          <StyledTouchableOpacity
            onPress={() => router.push(`/task/${task.id}`)}
            className="mx-4 my-2 bg-white border border-gray-200 rounded-lg p-4"
          >
            <StyledView className="mb-2">
              <StyledText className="text-lg font-semibold text-black">
                {task.title}
              </StyledText>
              <StyledText className="text-sm text-gray-600">
                {task.description}
              </StyledText>
            </StyledView>

            <StyledView className="flex-row justify-between items-center mt-3">
              <StyledView className="flex-row gap-2">
                <StyledText className={`px-2 py-1 rounded text-xs font-semibold ${getPriorityColor(task.priority)}`}>
                  {task.priority}
                </StyledText>
                <StyledText className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(task.status)}`}>
                  {task.status.replace("_", " ")}
                </StyledText>
              </StyledView>
              <StyledText className="text-xs text-gray-500">
                {task.dueDate}
              </StyledText>
            </StyledView>
          </StyledTouchableOpacity>
        )}
        contentContainerStyle={{ padding: 0, paddingTop: 8, paddingBottom: 20 }}
      />
    </SafeAreaView>
  );
}
