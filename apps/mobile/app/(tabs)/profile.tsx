import {
  View,
  Text,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { styled } from "nativewind";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";

const StyledView = styled(View);
const StyledText = styled(Text);
const StyledScrollView = styled(ScrollView);
const StyledTouchableOpacity = styled(TouchableOpacity);

export default function ProfileScreen() {
  const router = useRouter();

  const handleLogout = async () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      {
        text: "Cancel",
        onPress: () => {},
        style: "cancel",
      },
      {
        text: "Logout",
        onPress: async () => {
          try {
            await SecureStore.deleteItemAsync("auth_token");
            router.replace("/auth/login");
          } catch (error) {
            console.error("Logout failed:", error);
            Alert.alert("Error", "Failed to logout");
          }
        },
        style: "destructive",
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <StyledScrollView className="flex-1 px-4 py-4">
        {/* Profile Header */}
        <StyledView className="items-center mb-8 pt-4">
          <StyledView className="w-20 h-20 bg-blue-500 rounded-full mb-4 justify-center items-center">
            <StyledText className="text-4xl">👤</StyledText>
          </StyledView>
          <StyledText className="text-2xl font-bold text-black">
            John Doe
          </StyledText>
          <StyledText className="text-sm text-gray-600 mt-1">
            john@agentcenter.com
          </StyledText>
        </StyledView>

        {/* Profile Stats */}
        <StyledView className="flex-row justify-around mb-8 bg-gray-50 rounded-lg p-4">
          <StyledView className="items-center">
            <StyledText className="text-xl font-bold text-black">5</StyledText>
            <StyledText className="text-xs text-gray-600 mt-1">
              Active Tasks
            </StyledText>
          </StyledView>
          <StyledView className="items-center">
            <StyledText className="text-xl font-bold text-black">
              12
            </StyledText>
            <StyledText className="text-xs text-gray-600 mt-1">
              Completed
            </StyledText>
          </StyledView>
          <StyledView className="items-center">
            <StyledText className="text-xl font-bold text-black">
              3
            </StyledText>
            <StyledText className="text-xs text-gray-600 mt-1">
              Projects
            </StyledText>
          </StyledView>
        </StyledView>

        {/* Settings Section */}
        <StyledView className="mb-6">
          <StyledText className="text-lg font-semibold text-black mb-3">
            Settings
          </StyledText>

          <StyledTouchableOpacity className="bg-gray-50 rounded-lg p-4 mb-3 flex-row justify-between items-center">
            <StyledText className="text-base text-black font-medium">
              Notifications
            </StyledText>
            <StyledText className="text-gray-600">→</StyledText>
          </StyledTouchableOpacity>

          <StyledTouchableOpacity className="bg-gray-50 rounded-lg p-4 mb-3 flex-row justify-between items-center">
            <StyledText className="text-base text-black font-medium">
              Privacy
            </StyledText>
            <StyledText className="text-gray-600">→</StyledText>
          </StyledTouchableOpacity>

          <StyledTouchableOpacity className="bg-gray-50 rounded-lg p-4 flex-row justify-between items-center">
            <StyledText className="text-base text-black font-medium">
              About
            </StyledText>
            <StyledText className="text-gray-600">→</StyledText>
          </StyledTouchableOpacity>
        </StyledView>

        {/* Logout Button */}
        <StyledTouchableOpacity
          onPress={handleLogout}
          className="bg-red-600 rounded-lg py-4 justify-center items-center mt-8"
        >
          <StyledText className="text-white font-semibold text-lg">
            Logout
          </StyledText>
        </StyledTouchableOpacity>

        <StyledText className="text-center text-xs text-gray-500 mt-6">
          AgentCenter Mobile v0.0.1
        </StyledText>
      </StyledScrollView>
    </SafeAreaView>
  );
}
