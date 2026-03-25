import {
  View,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  FlatList,
} from "react-native";
import { useQuery } from "urql";
import { useState, useCallback } from "react";
import { PROFILES_QUERY } from "@agentcenter/graphql-client";
import { getMentionQuery, insertMentionHandle } from "@agentcenter/utils";
import type { ProfileWithAgent as Profile } from "@agentcenter/types";

interface MentionInputProps extends Omit<TextInputProps, "value" | "onChangeText"> {
  value: string;
  onChangeText: (text: string) => void;
  /** Extra style for the suggestions container positioning */
  suggestionsAbove?: boolean;
}

export function MentionInput({
  value,
  onChangeText,
  suggestionsAbove = true,
  style,
  ...rest
}: MentionInputProps) {
  const mentionQuery = getMentionQuery(value);
  const isSearching = mentionQuery !== null;

  const [profilesResult] = useQuery<{ profiles: Profile[] }>({
    query: PROFILES_QUERY,
    variables: { limit: 100 },
    requestPolicy: "cache-and-network",
    pause: !isSearching,
  });

  const suggestions = isSearching
    ? (profilesResult.data?.profiles ?? []).filter((p) => {
        if (!mentionQuery) return true;
        const q = mentionQuery.toLowerCase();
        return (
          p.username?.toLowerCase().startsWith(q) ||
          p.displayName.toLowerCase().includes(q)
        );
      }).slice(0, 6)
    : [];

  const handleSelect = useCallback(
    (username: string) => {
      onChangeText(insertMentionHandle(value, username));
    },
    [value, onChangeText]
  );

  return (
    <View className="flex-1 relative">
      {/* Suggestion list */}
      {suggestions.length > 0 && (
        <View
          className="absolute left-0 right-0 bg-white dark:bg-slate-800 rounded-[10px] border border-gray-200 dark:border-slate-700 overflow-hidden z-[100]"
          style={{
            ...(suggestionsAbove ? { bottom: "100%", marginBottom: 6 } : { top: "100%", marginTop: 6 }),
            shadowColor: "#000000",
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.08,
            shadowRadius: 8,
            elevation: 6,
          }}
        >
          <FlatList
            data={suggestions}
            keyExtractor={(p) => p.id}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={suggestions.length > 3}
            style={{ maxHeight: 180 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                className="flex-row items-center px-3 py-2 gap-2.5 border-b border-gray-100 dark:border-slate-700"
                onPress={() => item.username && handleSelect(item.username)}
                activeOpacity={0.7}
              >
                <View className="w-[30px] h-[30px] rounded-full bg-blue-100 dark:bg-blue-900/30 justify-center items-center">
                  <Text className="text-[13px] font-bold text-blue-700 dark:text-blue-300">
                    {item.agent?.identityEmoji ?? item.displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View className="flex-1 gap-px">
                  <Text className="text-[13px] font-semibold text-gray-900 dark:text-slate-100">
                    {item.displayName}
                  </Text>
                  <Text className="text-[11px] text-gray-400 dark:text-slate-500">
                    @{item.username}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      <TextInput
        style={style}
        value={value}
        onChangeText={onChangeText}
        {...rest}
      />
    </View>
  );
}
