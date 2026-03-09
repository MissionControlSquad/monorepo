import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
} from "react-native";
import { styled } from "nativewind";
import { useRouter } from "expo-router";

const StyledView = styled(View);
const StyledText = styled(Text);
const StyledScrollView = styled(ScrollView);
const StyledTouchableOpacity = styled(TouchableOpacity);

export default function DashboardScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-white">
      <StyledScrollView className="flex-1 px-4 py-4">
        {/* Header Section */}
        <StyledView className="mb-6">
          <StyledText className="text-2xl font-bold text-black mb-2">
            Welcome back!
          </StyledText>
          <StyledText className="text-base text-gray-600">
            Your tasks and projects at a glance
          </StyledText>
        </StyledView>

        {/* Quick Stats */}
        <StyledView className="flex-row justify-between mb-6 gap-3">
          <StyledView className="flex-1 bg-blue-50 rounded-lg p-4">
            <StyledText className="text-gray-600 text-sm mb-2">
              Active Tasks
            </StyledText>
            <StyledText className="text-2xl font-bold text-blue-600">
              5
            </StyledText>
          </StyledView>
          <StyledView className="flex-1 bg-green-50 rounded-lg p-4">
            <StyledText className="text-gray-600 text-sm mb-2">
              Completed
            </StyledText>
            <StyledText className="text-2xl font-bold text-green-600">
              12
            </StyledText>
          </StyledView>
          <StyledView className="flex-1 bg-orange-50 rounded-lg p-4">
            <StyledText className="text-gray-600 text-sm mb-2">
              Agents
            </StyledText>
            <StyledText className="text-2xl font-bold text-orange-600">
              3
            </StyledText>
          </StyledView>
        </StyledView>

        {/* Recent Tasks */}
        <StyledView className="mb-6">
          <StyledView className="flex-row justify-between items-center mb-4">
            <StyledText className="text-lg font-semibold text-black">
              Recent Tasks
            </StyledText>
            <StyledTouchableOpacity
              onPress={() => router.push("/(tabs)/tasks")}
            >
              <StyledText className="text-blue-600 font-semibold">
                See All
              </StyledText>
            </StyledTouchableOpacity>
          </StyledView>

          {/* Task Item Placeholder */}
          <StyledView className="bg-gray-50 rounded-lg p-4 mb-3">
            <StyledText className="font-semibold text-black mb-1">
              Task Title
            </StyledText>
            <StyledText className="text-sm text-gray-600">
              Description of the task
            </StyledText>
            <StyledView className="mt-3 flex-row justify-between items-center">
              <StyledText className="text-xs text-gray-500">
                Due in 2 days
              </StyledText>
              <StyledText className="px-3 py-1 bg-blue-100 text-blue-600 rounded-full text-xs font-semibold">
                In Progress
              </StyledText>
            </StyledView>
          </StyledView>

          <StyledView className="bg-gray-50 rounded-lg p-4 mb-3">
            <StyledText className="font-semibold text-black mb-1">
              Another Task
            </StyledText>
            <StyledText className="text-sm text-gray-600">
              This is another task for you
            </StyledText>
            <StyledView className="mt-3 flex-row justify-between items-center">
              <StyledText className="text-xs text-gray-500">
                Due tomorrow
              </StyledText>
              <StyledText className="px-3 py-1 bg-yellow-100 text-yellow-600 rounded-full text-xs font-semibold">
                Pending
              </StyledText>
            </StyledView>
          </StyledView>
        </StyledView>

        {/* Agents Status */}
        <StyledView className="mb-6">
          <StyledText className="text-lg font-semibold text-black mb-4">
            Agent Status
          </StyledText>
          <StyledView className="bg-green-50 rounded-lg p-4 mb-3 flex-row items-center">
            <View className="w-3 h-3 bg-green-500 rounded-full mr-3" />
            <StyledView className="flex-1">
              <StyledText className="font-semibold text-black">
                Agent-1
              </StyledText>
              <StyledText className="text-xs text-gray-600">
                Active · Last seen 2m ago
              </StyledText>
            </StyledView>
          </StyledView>
          <StyledView className="bg-gray-50 rounded-lg p-4 flex-row items-center">
            <View className="w-3 h-3 bg-gray-400 rounded-full mr-3" />
            <StyledView className="flex-1">
              <StyledText className="font-semibold text-black">
                Agent-2
              </StyledText>
              <StyledText className="text-xs text-gray-600">
                Idle · Last seen 1h ago
              </StyledText>
            </StyledView>
          </StyledView>
        </StyledView>
      </StyledScrollView>
    </SafeAreaView>
  );
}
