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
import { useTheme } from "../hooks/useTheme";
import { getMentionQuery, insertMentionHandle } from "@agentcenter/utils";

interface Profile {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  agent: { identityEmoji: string | null } | null;
}

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
  const { colors } = useTheme();
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
          p.username.toLowerCase().startsWith(q) ||
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
    <View style={{ flex: 1, position: "relative" }}>
      {/* Suggestion list */}
      {suggestions.length > 0 && (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            ...(suggestionsAbove ? { bottom: "100%", marginBottom: 6 } : { top: "100%", marginTop: 6 }),
            backgroundColor: colors.card,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.08,
            shadowRadius: 8,
            elevation: 6,
            zIndex: 100,
            overflow: "hidden",
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
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  gap: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.borderAlt,
                }}
                onPress={() => handleSelect(item.username)}
                activeOpacity={0.7}
              >
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    backgroundColor: colors.accentSurface,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.accentText }}>
                    {item.agent?.identityEmoji ?? item.displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>
                    {item.displayName}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted }}>
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
