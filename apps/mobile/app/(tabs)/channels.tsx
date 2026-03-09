import {
  View,
  Text,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
} from "react-native";
import { styled } from "nativewind";
import { useRouter } from "expo-router";

const StyledView = styled(View);
const StyledText = styled(Text);
const StyledTouchableOpacity = styled(TouchableOpacity);

type Channel = {
  id: string;
  name: string;
  description: string;
  type: "channel" | "dm";
  unreadCount: number;
  lastMessage: string;
  participants: number;
};

const MOCK_CHANNELS: Channel[] = [
  {
    id: "1",
    name: "general",
    description: "General discussion",
    type: "channel",
    unreadCount: 0,
    lastMessage: "Let's get started!",
    participants: 5,
  },
  {
    id: "2",
    name: "Frontend Team",
    description: "FE-related discussions",
    type: "channel",
    unreadCount: 2,
    lastMessage: "Expo setup complete",
    participants: 3,
  },
  {
    id: "3",
    name: "Alice Johnson",
    description: "Direct message",
    type: "dm",
    unreadCount: 1,
    lastMessage: "Thanks for the update!",
    participants: 2,
  },
];

export default function ChannelsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-white">
      <StyledView className="px-4 py-4 border-b border-gray-200">
        <StyledText className="text-2xl font-bold text-black">
          Channels & Messages
        </StyledText>
      </StyledView>

      <FlatList
        data={MOCK_CHANNELS}
        keyExtractor={(item) => item.id}
        renderItem={({ item: channel }) => (
          <StyledTouchableOpacity
            onPress={() => router.push(`/channel/${channel.id}`)}
            className="px-4 py-3 border-b border-gray-100"
          >
            <StyledView className="flex-row justify-between items-center mb-2">
              <StyledView className="flex-1">
                <StyledView className="flex-row items-center gap-2">
                  {channel.unreadCount > 0 && (
                    <StyledView className="w-4 h-4 bg-blue-600 rounded-full" />
                  )}
                  <StyledText className="text-lg font-semibold text-black">
                    {channel.type === "channel" ? "#" : ""}{channel.name}
                  </StyledText>
                </StyledView>
                <StyledText className="text-sm text-gray-600 mt-1">
                  {channel.lastMessage}
                </StyledText>
              </StyledView>
              {channel.unreadCount > 0 && (
                <StyledView className="bg-blue-600 rounded-full w-6 h-6 justify-center items-center">
                  <StyledText className="text-white text-xs font-bold">
                    {channel.unreadCount}
                  </StyledText>
                </StyledView>
              )}
            </StyledView>
            <StyledText className="text-xs text-gray-500">
              {channel.participants} participant{channel.participants !== 1 ? "s" : ""}
            </StyledText>
          </StyledTouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </SafeAreaView>
  );
}
