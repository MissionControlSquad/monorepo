import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SectionList,
  ActivityIndicator,
} from "react-native";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "urql";
import { GLOBAL_SEARCH_QUERY, TASK_BY_NUMBER_QUERY } from "@agentcenter/graphql-client";
import { Ionicons } from "@expo/vector-icons";
import { StatusPill } from "../src/components/StatusPill";
import { SectionLabel } from "../src/components/SectionLabel";

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

interface SearchResults {
  tasks: TaskResult[];
  messages: MessageResult[];
  deliverables: DeliverableResult[];
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const inputRef = useRef<TextInput>(null);

  // Detect #number pattern for direct task navigation
  const taskNumberMatch = submittedQuery.trim().match(/^#(\d+)$/);
  const taskNumber = taskNumberMatch ? parseInt(taskNumberMatch[1], 10) : null;

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [taskByNumberResult] = useQuery<{ taskByNumber: { id: string } | null }>({
    query: TASK_BY_NUMBER_QUERY,
    variables: { taskNumber: taskNumber ?? 0 },
    pause: !mounted || taskNumber === null,
    requestPolicy: "cache-and-network",
  });

  const [result] = useQuery<{ globalSearch: SearchResults }>({
    query: GLOBAL_SEARCH_QUERY,
    variables: { searchText: submittedQuery, limit: 30 },
    pause: !mounted || submittedQuery.trim().length < 2 || taskNumber !== null,
    requestPolicy: "cache-and-network",
  });

  const tasks = result.data?.globalSearch.tasks ?? [];
  const messages = result.data?.globalSearch.messages ?? [];
  const deliverables = result.data?.globalSearch.deliverables ?? [];

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
    <View className="flex-1 bg-white dark:bg-slate-900">
      {/* Search bar */}
      <View className="flex-row items-center bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700 px-4 py-3 gap-2.5">
        <View className="flex-1 flex-row items-center bg-gray-100 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl px-3 gap-2">
          <Ionicons name="search-outline" size={18} color="#9ca3af" />
          <TextInput
            ref={inputRef}
            className="flex-1 text-base text-gray-900 dark:text-slate-100 py-2.5"
            placeholder="Search tasks, messages, deliverables…"
            placeholderTextColor="#9ca3af"
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
              <Ionicons name="close-circle" size={18} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={handleSubmit} activeOpacity={0.7}>
          <Text className="text-blue-600 dark:text-blue-400 text-base font-semibold">Search</Text>
        </TouchableOpacity>
      </View>

      {/* Results */}
      {(result.fetching || taskByNumberResult.fetching) ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : taskNumber !== null && !resolvedTaskId && !taskByNumberResult.fetching ? (
        <View className="flex-1 justify-center items-center gap-2">
          <Ionicons name="file-tray-outline" size={48} color="#d1d5db" />
          <Text className="text-base text-gray-400 dark:text-slate-500">Task #{taskNumber} not found</Text>
        </View>
      ) : !searched ? (
        <View className="flex-1 justify-center items-center gap-2">
          <Ionicons name="search-outline" size={48} color="#d1d5db" />
          <Text className="text-base text-gray-400 dark:text-slate-500">Search tasks, messages, deliverables</Text>
          <Text className="text-sm text-gray-400 dark:text-slate-500">Tip: type #42 to jump to a task by number</Text>
        </View>
      ) : result.error ? (
        <View className="flex-1 justify-center items-center gap-2">
          <Ionicons name="cloud-offline-outline" size={48} color="#d1d5db" />
          <Text className="text-base text-red-500 dark:text-red-400 text-center px-6">Search failed. Check your connection.</Text>
        </View>
      ) : !hasResults ? (
        <View className="flex-1 justify-center items-center gap-2">
          <Ionicons name="file-tray-outline" size={48} color="#d1d5db" />
          <Text className="text-base text-gray-400 dark:text-slate-500">No results for "{submittedQuery}"</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => (item as { id: string }).id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          contentInsetAdjustmentBehavior="automatic"
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View className="px-4 pt-4 pb-1.5 bg-white dark:bg-slate-900">
              <SectionLabel>{section.title}</SectionLabel>
            </View>
          )}
          renderItem={({ item, section }) => {
            if (section.type === "task") {
              const t = item as TaskResult;
              return (
                <TouchableOpacity
                  className="bg-white dark:bg-slate-800 mx-4 mb-2 rounded-xl p-3.5 border border-gray-200 dark:border-slate-700 gap-1"
                  onPress={() => router.push(`/task/${t.id}` as Parameters<typeof router.push>[0])}
                  activeOpacity={0.7}
                >
                  <View className="flex-row items-center gap-2">
                    <Text className="text-xs text-gray-400 dark:text-slate-500" style={{ fontVariant: ["tabular-nums"] }}>
                      #{t.taskNumber}
                    </Text>
                    <StatusPill status={t.status} />
                    {t.priority && (
                      <Text className="text-xs text-gray-400 dark:text-slate-500 capitalize">{t.priority}</Text>
                    )}
                  </View>
                  <Text className="text-sm font-semibold text-gray-900 dark:text-slate-100" numberOfLines={2}>
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
                  className="bg-white dark:bg-slate-800 mx-4 mb-2 rounded-xl p-3.5 border border-gray-200 dark:border-slate-700 gap-1"
                  onPress={() => dest && router.push(dest as Parameters<typeof router.push>[0])}
                  activeOpacity={0.7}
                  disabled={!dest}
                >
                  <View className="flex-row items-center gap-1.5">
                    <Ionicons name="chatbubble-outline" size={13} color="#9ca3af" />
                    <Text className="text-xs text-gray-400 dark:text-slate-500">
                      {m.taskId ? "Task message" : "Channel message"}
                    </Text>
                  </View>
                  <Text className="text-sm text-gray-900 dark:text-slate-100" numberOfLines={3}>
                    {m.content}
                  </Text>
                </TouchableOpacity>
              );
            }

            if (section.type === "deliverable") {
              const d = item as DeliverableResult;
              return (
                <TouchableOpacity
                  className="bg-white dark:bg-slate-800 mx-4 mb-2 rounded-xl p-3.5 border border-gray-200 dark:border-slate-700 gap-1"
                  onPress={() => router.push(`/deliverable/${d.id}` as Parameters<typeof router.push>[0])}
                  activeOpacity={0.7}
                >
                  <View className="flex-row items-center gap-1.5">
                    <Ionicons name="attach-outline" size={13} color="#9ca3af" />
                    <Text className="text-xs text-gray-400 dark:text-slate-500 capitalize">{d.type}</Text>
                  </View>
                  <Text className="text-sm font-semibold text-gray-900 dark:text-slate-100" numberOfLines={2}>
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
