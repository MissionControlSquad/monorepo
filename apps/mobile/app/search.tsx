import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  SectionList,
} from "react-native";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "urql";
import { GLOBAL_SEARCH_QUERY, TASK_BY_NUMBER_QUERY } from "@agentcenter/graphql-client";
import { STATUS_HEX_COLORS } from "@agentcenter/utils";
import { useTheme } from "../src/hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";

// The server returns JSON-encoded arrays in these fields
interface SearchResults {
  tasks: string;      // JSON: Array<{ id, title, taskNumber, status, priority }>
  messages: string;   // JSON: Array<{ id, content, taskId, channelId }>
  deliverables: string; // JSON: Array<{ id, title, type, taskId }>
}

interface TaskResult {
  id: string;
  title: string;
  taskNumber: number;
  status: string;
  priority: string | null;
}

interface MessageResult {
  id: string;
  content: string;
  taskId: string | null;
  channelId: string | null;
}

interface DeliverableResult {
  id: string;
  title: string;
  type: string;
  taskId: string;
}


function parseJSON<T>(raw: string | undefined | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export default function SearchScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const inputRef = useRef<TextInput>(null);

  // Detect #number pattern for direct task navigation
  const taskNumberMatch = submittedQuery.trim().match(/^#(\d+)$/);
  const taskNumber = taskNumberMatch ? parseInt(taskNumberMatch[1], 10) : null;

  const [taskByNumberResult] = useQuery<{ taskByNumber: { id: string } | null }>({
    query: TASK_BY_NUMBER_QUERY,
    variables: { taskNumber: taskNumber ?? 0 },
    pause: taskNumber === null,
    requestPolicy: "cache-and-network",
  });

  const [result] = useQuery<{ globalSearch: SearchResults }>({
    query: GLOBAL_SEARCH_QUERY,
    variables: { searchText: submittedQuery, limit: 30 },
    pause: submittedQuery.trim().length < 2 || taskNumber !== null,
    requestPolicy: "cache-and-network",
  });

  const tasks = parseJSON<TaskResult>(result.data?.globalSearch.tasks);
  const messages = parseJSON<MessageResult>(result.data?.globalSearch.messages);
  const deliverables = parseJSON<DeliverableResult>(result.data?.globalSearch.deliverables);

  const totalCount = tasks.length + messages.length + deliverables.length;
  const hasResults = totalCount > 0;
  const searched = submittedQuery.trim().length >= 2;

  // Auto-navigate when #number resolves to a task
  const resolvedTaskId = taskByNumberResult.data?.taskByNumber?.id;
  useEffect(() => {
    if (resolvedTaskId) {
      router.push(`/task/${resolvedTaskId}`);
    }
  }, [resolvedTaskId]);

  function handleSubmit() {
    const q = query.trim();
    if (q.length >= 2) setSubmittedQuery(q);
  }

  function handleClear() {
    setQuery("");
    setSubmittedQuery("");
    inputRef.current?.focus();
  }

  const sections = [
    ...(tasks.length > 0
      ? [{ title: `Tasks (${tasks.length})`, data: tasks as (TaskResult | MessageResult | DeliverableResult)[], type: "task" as const }]
      : []),
    ...(messages.length > 0
      ? [{ title: `Messages (${messages.length})`, data: messages as (TaskResult | MessageResult | DeliverableResult)[], type: "message" as const }]
      : []),
    ...(deliverables.length > 0
      ? [{ title: `Deliverables (${deliverables.length})`, data: deliverables as (TaskResult | MessageResult | DeliverableResult)[], type: "deliverable" as const }]
      : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Search bar */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          gap: 10,
        }}
      >
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.inputBg,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            paddingHorizontal: 12,
            gap: 8,
          }}
        >
          <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
          <TextInput
            ref={inputRef}
            style={{ flex: 1, fontSize: 15, color: colors.text, paddingVertical: 10 }}
            placeholder="Search tasks, messages, deliverables…"
            placeholderTextColor={colors.placeholder}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSubmit}
            returnKeyType="search"
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={handleClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={handleSubmit} activeOpacity={0.7}>
          <Text style={{ color: colors.accent, fontSize: 15, fontWeight: "600" }}>Search</Text>
        </TouchableOpacity>
      </View>

      {/* Results */}
      {(result.fetching || taskByNumberResult.fetching) ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : taskNumber !== null && !resolvedTaskId && !taskByNumberResult.fetching ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 8 }}>
          <Ionicons name="file-tray-outline" size={48} color={colors.border} />
          <Text style={{ fontSize: 15, color: colors.textMuted }}>Task #{taskNumber} not found</Text>
        </View>
      ) : !searched ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 8 }}>
          <Ionicons name="search-outline" size={48} color={colors.border} />
          <Text style={{ fontSize: 15, color: colors.textMuted }}>Search tasks, messages, deliverables</Text>
          <Text style={{ fontSize: 13, color: colors.textMuted }}>Tip: type #42 to jump to a task by number</Text>
        </View>
      ) : !hasResults ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 8 }}>
          <Ionicons name="file-tray-outline" size={48} color={colors.border} />
          <Text style={{ fontSize: 15, color: colors.textMuted }}>No results for "{submittedQuery}"</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => (item as { id: string }).id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          contentInsetAdjustmentBehavior="automatic"
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View
              style={{
                paddingHorizontal: 16,
                paddingTop: 16,
                paddingBottom: 6,
                backgroundColor: colors.background,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {section.title}
              </Text>
            </View>
          )}
          renderItem={({ item, section }) => {
            if (section.type === "task") {
              const t = item as TaskResult;
              const statusColor = STATUS_HEX_COLORS[t.status] ?? colors.textMuted;
              return (
                <TouchableOpacity
                  style={{
                    backgroundColor: colors.card,
                    marginHorizontal: 16,
                    marginBottom: 8,
                    borderRadius: 10,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: colors.border,
                    gap: 4,
                  }}
                  onPress={() => router.push(`/task/${t.id}` as Parameters<typeof router.push>[0])}
                  activeOpacity={0.7}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ fontSize: 11, color: colors.textMuted, fontVariant: ["tabular-nums"] }}>
                      #{t.taskNumber}
                    </Text>
                    <View style={{ backgroundColor: statusColor + "20", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, color: statusColor, fontWeight: "600", textTransform: "uppercase" }}>
                        {t.status.replace("_", " ")}
                      </Text>
                    </View>
                    {t.priority && (
                      <Text style={{ fontSize: 11, color: colors.textMuted, textTransform: "capitalize" }}>{t.priority}</Text>
                    )}
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }} numberOfLines={2}>
                    {t.title}
                  </Text>
                </TouchableOpacity>
              );
            }

            if (section.type === "message") {
              const m = item as MessageResult;
              const dest = m.taskId
                ? `/task/${m.taskId}`
                : m.channelId
                ? `/channels/${m.channelId}`
                : null;
              return (
                <TouchableOpacity
                  style={{
                    backgroundColor: colors.card,
                    marginHorizontal: 16,
                    marginBottom: 8,
                    borderRadius: 10,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: colors.border,
                    gap: 4,
                  }}
                  onPress={() => dest && router.push(dest as Parameters<typeof router.push>[0])}
                  activeOpacity={0.7}
                  disabled={!dest}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="chatbubble-outline" size={13} color={colors.textMuted} />
                    <Text style={{ fontSize: 11, color: colors.textMuted }}>
                      {m.taskId ? "Task message" : "Channel message"}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 14, color: colors.text }} numberOfLines={3}>
                    {m.content}
                  </Text>
                </TouchableOpacity>
              );
            }

            if (section.type === "deliverable") {
              const d = item as DeliverableResult;
              return (
                <TouchableOpacity
                  style={{
                    backgroundColor: colors.card,
                    marginHorizontal: 16,
                    marginBottom: 8,
                    borderRadius: 10,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: colors.border,
                    gap: 4,
                  }}
                  onPress={() => router.push(`/deliverable/${d.id}` as Parameters<typeof router.push>[0])}
                  activeOpacity={0.7}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="attach-outline" size={13} color={colors.textMuted} />
                    <Text style={{ fontSize: 11, color: colors.textMuted, textTransform: "capitalize" }}>{d.type}</Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }} numberOfLines={2}>
                    {d.title}
                  </Text>
                </TouchableOpacity>
              );
            }

            return null;
          }}
        />
      )}
    </View>
  );
}
