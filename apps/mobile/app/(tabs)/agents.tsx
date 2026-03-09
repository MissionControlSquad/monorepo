import {
  View,
  Text,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
} from "react-native";
import { styled } from "nativewind";

const StyledView = styled(View);
const StyledText = styled(Text);
const StyledTouchableOpacity = styled(TouchableOpacity);

type Agent = {
  id: string;
  name: string;
  status: "online" | "idle" | "offline";
  lastSeen: string;
  currentTask?: string;
  emoji?: string;
};

const MOCK_AGENTS: Agent[] = [
  {
    id: "1",
    name: "FE-2",
    status: "online",
    lastSeen: "now",
    currentTask: "Mobile app scaffolding",
    emoji: "⚛️",
  },
  {
    id: "2",
    name: "BE-1",
    status: "idle",
    lastSeen: "10 minutes ago",
    currentTask: "API optimization",
    emoji: "🔧",
  },
  {
    id: "3",
    name: "PM-1",
    status: "offline",
    lastSeen: "2 hours ago",
    emoji: "📋",
  },
];

const getStatusColor = (status: Agent["status"]) => {
  switch (status) {
    case "online":
      return { dot: "bg-green-500", text: "text-green-600", bg: "bg-green-50" };
    case "idle":
      return { dot: "bg-yellow-500", text: "text-yellow-600", bg: "bg-yellow-50" };
    case "offline":
      return { dot: "bg-gray-400", text: "text-gray-600", bg: "bg-gray-50" };
  }
};

export default function AgentsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <StyledView className="px-4 py-4 border-b border-gray-200">
        <StyledText className="text-2xl font-bold text-black">
          Agents
        </StyledText>
        <StyledText className="text-sm text-gray-600 mt-1">
          {MOCK_AGENTS.length} agents
        </StyledText>
      </StyledView>

      <FlatList
        data={MOCK_AGENTS}
        keyExtractor={(item) => item.id}
        renderItem={({ item: agent }) => {
          const colors = getStatusColor(agent.status);
          return (
            <StyledTouchableOpacity className={`mx-4 my-2 ${colors.bg} rounded-lg p-4 flex-row items-center`}>
              <StyledView className="w-12 h-12 bg-gray-200 rounded-full justify-center items-center mr-3">
                <StyledText className="text-2xl">{agent.emoji || "🤖"}</StyledText>
              </StyledView>

              <StyledView className="flex-1">
                <StyledView className="flex-row items-center gap-2 mb-1">
                  <StyledView className={`w-3 h-3 ${colors.dot} rounded-full`} />
                  <StyledText className="text-lg font-semibold text-black">
                    {agent.name}
                  </StyledText>
                  <StyledText className={`text-xs font-semibold ${colors.text}`}>
                    {agent.status}
                  </StyledText>
                </StyledView>

                {agent.currentTask ? (
                  <StyledText className="text-sm text-gray-700 mb-1">
                    {agent.currentTask}
                  </StyledText>
                ) : null}

                <StyledText className="text-xs text-gray-500">
                  Last seen {agent.lastSeen}
                </StyledText>
              </StyledView>
            </StyledTouchableOpacity>
          );
        }}
        contentContainerStyle={{ padding: 0, paddingTop: 8, paddingBottom: 20 }}
      />
    </SafeAreaView>
  );
}
