import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { styled } from "nativewind";
import { useLocalSearchParams, useRouter } from "expo-router";

const StyledView = styled(View);
const StyledText = styled(Text);
const StyledScrollView = styled(ScrollView);
const StyledTouchableOpacity = styled(TouchableOpacity);

export default function TaskDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();

  // Mock task data
  const task = {
    id,
    title: "Setup Expo Router",
    description:
      "Configure file-based routing for the mobile app using Expo Router",
    status: "in_progress",
    priority: "high",
    dueDate: "2026-03-15",
    assignee: "FE-2",
    project: "AgentCenter Mobile",
    createdAt: "2026-03-09",
    labels: ["mobile", "setup", "routing"],
    comments: [
      {
        id: "1",
        author: "John Doe",
        text: "Let's get started on this",
        timestamp: "2 hours ago",
      },
    ],
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <StyledView className="px-4 py-3 border-b border-gray-200 flex-row items-center justify-between">
        <StyledTouchableOpacity onPress={() => router.back()}>
          <StyledText className="text-lg text-blue-600 font-semibold">
            ← Back
          </StyledText>
        </StyledTouchableOpacity>
        <StyledText className="text-lg font-semibold text-black">
          Task Details
        </StyledText>
        <StyledView className="w-8" />
      </StyledView>

      <StyledScrollView className="flex-1 px-4 py-4">
        {/* Title and Status */}
        <StyledView className="mb-6">
          <StyledText className="text-2xl font-bold text-black mb-3">
            {task.title}
          </StyledText>
          <StyledView className="flex-row gap-2">
            <StyledView className="bg-blue-100 px-3 py-1 rounded-full">
              <StyledText className="text-blue-600 text-xs font-semibold capitalize">
                {task.status.replace("_", " ")}
              </StyledText>
            </StyledView>
            <StyledView className="bg-red-100 px-3 py-1 rounded-full">
              <StyledText className="text-red-600 text-xs font-semibold capitalize">
                {task.priority}
              </StyledText>
            </StyledView>
          </StyledView>
        </StyledView>

        {/* Description */}
        <StyledView className="mb-6">
          <StyledText className="text-sm font-semibold text-gray-700 mb-2">
            Description
          </StyledText>
          <StyledText className="text-base text-gray-600 leading-6">
            {task.description}
          </StyledText>
        </StyledView>

        {/* Details Grid */}
        <StyledView className="mb-6">
          <StyledView className="flex-row mb-4">
            <StyledView className="flex-1">
              <StyledText className="text-xs text-gray-500 font-semibold mb-1">
                Assignee
              </StyledText>
              <StyledText className="text-sm text-black font-semibold">
                {task.assignee}
              </StyledText>
            </StyledView>
            <StyledView className="flex-1">
              <StyledText className="text-xs text-gray-500 font-semibold mb-1">
                Project
              </StyledText>
              <StyledText className="text-sm text-black font-semibold">
                {task.project}
              </StyledText>
            </StyledView>
          </StyledView>

          <StyledView className="flex-row">
            <StyledView className="flex-1">
              <StyledText className="text-xs text-gray-500 font-semibold mb-1">
                Due Date
              </StyledText>
              <StyledText className="text-sm text-black font-semibold">
                {task.dueDate}
              </StyledText>
            </StyledView>
            <StyledView className="flex-1">
              <StyledText className="text-xs text-gray-500 font-semibold mb-1">
                Created
              </StyledText>
              <StyledText className="text-sm text-black font-semibold">
                {task.createdAt}
              </StyledText>
            </StyledView>
          </StyledView>
        </StyledView>

        {/* Labels */}
        <StyledView className="mb-6">
          <StyledText className="text-sm font-semibold text-gray-700 mb-2">
            Labels
          </StyledText>
          <StyledView className="flex-row gap-2 flex-wrap">
            {task.labels.map((label) => (
              <StyledView key={label} className="bg-gray-100 px-3 py-1 rounded-full">
                <StyledText className="text-gray-700 text-xs font-semibold">
                  {label}
                </StyledText>
              </StyledView>
            ))}
          </StyledView>
        </StyledView>

        {/* Comments */}
        <StyledView className="mb-6">
          <StyledText className="text-sm font-semibold text-gray-700 mb-3">
            Comments ({task.comments.length})
          </StyledText>
          {task.comments.map((comment) => (
            <StyledView key={comment.id} className="bg-gray-50 rounded-lg p-3 mb-3">
              <StyledView className="flex-row justify-between items-center mb-2">
                <StyledText className="font-semibold text-black">
                  {comment.author}
                </StyledText>
                <StyledText className="text-xs text-gray-500">
                  {comment.timestamp}
                </StyledText>
              </StyledView>
              <StyledText className="text-sm text-gray-700">
                {comment.text}
              </StyledText>
            </StyledView>
          ))}
        </StyledView>

        {/* Action Buttons */}
        <StyledView className="flex-row gap-3 mb-6">
          <StyledTouchableOpacity className="flex-1 bg-blue-600 rounded-lg py-3 justify-center items-center">
            <StyledText className="text-white font-semibold">
              Update Status
            </StyledText>
          </StyledTouchableOpacity>
          <StyledTouchableOpacity className="flex-1 bg-gray-200 rounded-lg py-3 justify-center items-center">
            <StyledText className="text-gray-800 font-semibold">
              Add Comment
            </StyledText>
          </StyledTouchableOpacity>
        </StyledView>
      </StyledScrollView>
    </SafeAreaView>
  );
}
