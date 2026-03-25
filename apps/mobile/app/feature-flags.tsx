import {
  View,
  Text,
  Switch,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
  useColorScheme,
} from "react-native";
import { useQuery, useMutation } from "urql";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FEATURE_FLAGS_QUERY, UPDATE_FEATURE_FLAG } from "@agentcenter/graphql-client";
import { EmptyState } from "../src/components/EmptyState";
import type { FeatureFlag } from "@agentcenter/types";

export default function FeatureFlagsScreen() {
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";

  const [result, reexecute] = useQuery<{ featureFlags: FeatureFlag[] }>({
    query: FEATURE_FLAGS_QUERY,
    requestPolicy: "cache-and-network",
  });

  const [, updateFlag] = useMutation(UPDATE_FEATURE_FLAG);

  const flags = result.data?.featureFlags ?? [];

  async function handleToggle(flag: FeatureFlag) {
    if (flag.managedBy && flag.managedBy !== "admin") {
      Alert.alert(
        "Managed Flag",
        `This flag is managed by "${flag.managedBy}" and cannot be changed here.`
      );
      return;
    }
    const res = await updateFlag({ key: flag.key, enabled: !flag.enabled });
    if (res.error) {
      Alert.alert("Error", res.error.message ?? "Failed to update flag");
    } else {
      reexecute({ requestPolicy: "network-only" });
    }
  }

  if (result.fetching && flags.length === 0) {
    return (
      <View className="flex-1 justify-center items-center bg-white dark:bg-slate-900">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white dark:bg-slate-900">
      {result.error && !result.data && (
        <View className="m-4 p-4 bg-red-50 dark:bg-red-950/30 rounded-xl">
          <Text className="text-red-600 dark:text-red-400 text-sm">{result.error.message}</Text>
        </View>
      )}
      <FlatList
        data={flags}
        keyExtractor={(f) => f.key}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 24 }}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={result.fetching && flags.length > 0}
            onRefresh={() => reexecute({ requestPolicy: "network-only" })}
            tintColor="#2563eb"
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="toggle-outline"
            message="No feature flags configured"
          />
        }
        renderItem={({ item }) => {
          const isManaged = !!item.managedBy && item.managedBy !== "admin";
          return (
            <View className="bg-white dark:bg-slate-800 rounded-xl p-3.5 border border-gray-200 dark:border-slate-700 flex-row items-center gap-3">
              <View className="flex-1 gap-0.5">
                <Text className="text-sm font-bold text-gray-900 dark:text-slate-100">
                  {item.key}
                </Text>
                {item.description ? (
                  <Text className="text-xs text-gray-500 dark:text-slate-400" numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
                {item.managedBy ? (
                  <Text className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                    Managed by: {item.managedBy}
                  </Text>
                ) : null}
              </View>
              <Switch
                value={item.enabled}
                onValueChange={() => handleToggle(item)}
                disabled={isManaged}
                trackColor={{ false: isDark ? "#334155" : "#e5e7eb", true: "#2563eb80" }}
                thumbColor={item.enabled ? "#2563eb" : isDark ? "#64748b" : "#9ca3af"}
                ios_backgroundColor={isDark ? "#334155" : "#e5e7eb"}
              />
            </View>
          );
        }}
      />
    </View>
  );
}
