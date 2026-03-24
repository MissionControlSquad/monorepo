import {
  View,
  Text,
  Switch,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useQuery, useMutation } from "urql";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FEATURE_FLAGS_QUERY, UPDATE_FEATURE_FLAG } from "@agentcenter/graphql-client";
import { useTheme } from "../src/hooks/useTheme";
import { EmptyState } from "../src/components/EmptyState";
import type { FeatureFlag } from "@agentcenter/types";

export default function FeatureFlagsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

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
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {result.error && !result.data && (
        <View style={{ padding: 16, backgroundColor: colors.danger + "18", margin: 16, borderRadius: 10 }}>
          <Text style={{ color: colors.danger, fontSize: 14 }}>{result.error.message}</Text>
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
            tintColor={colors.accent}
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
            <View
              style={{
                backgroundColor: colors.card,
                borderRadius: 12,
                padding: 14,
                borderWidth: 1,
                borderColor: colors.border,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text }}>
                  {item.key}
                </Text>
                {item.description ? (
                  <Text style={{ fontSize: 12, color: colors.textSecondary }} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
                {item.managedBy ? (
                  <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                    Managed by: {item.managedBy}
                  </Text>
                ) : null}
              </View>
              <Switch
                value={item.enabled}
                onValueChange={() => handleToggle(item)}
                disabled={isManaged}
                trackColor={{ false: colors.border, true: colors.accent + "80" }}
                thumbColor={item.enabled ? colors.accent : colors.textMuted}
                ios_backgroundColor={colors.border}
              />
            </View>
          );
        }}
      />
    </View>
  );
}
