import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery } from "urql";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CREATE_PROJECT, PROFILES_QUERY } from "@agentcenter/graphql-client";
import { DEFAULT_AGENT_EMOJI } from "@agentcenter/utils";
import { Ionicons } from "@expo/vector-icons";

interface Profile {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  agentId: string | null;
  agent?: { id: string; name: string; identityEmoji: string | null } | null;
}

export default function CreateProjectScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [, createProject] = useMutation(CREATE_PROJECT);
  const [saving, setSaving] = useState(false);

  const [profilesResult] = useQuery<{ profiles: Profile[] }>({
    query: PROFILES_QUERY,
    variables: { limit: 200 },
    requestPolicy: "cache-and-network",
  });

  const profiles = profilesResult.data?.profiles ?? [];

  function toggleProfile(id: string) {
    setSelectedProfileIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleCreate() {
    if (!name.trim()) {
      Alert.alert("Error", "Project name is required");
      return;
    }
    setSaving(true);
    const res = await createProject({
      name: name.trim(),
      description: description.trim() || undefined,
      memberProfileIds: selectedProfileIds.length ? selectedProfileIds : undefined,
    });
    setSaving(false);
    if (res.error) {
      Alert.alert("Error", res.error.message);
    } else if (res.data?.createProject?.id) {
      router.replace(`/project/${res.data.createProject.id}`);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-gray-50 dark:bg-slate-900"
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-1.5">
          <Text className="text-[13px] font-semibold text-gray-700 dark:text-slate-300">Project Name *</Text>
          <TextInput
            className="border border-gray-300 dark:border-slate-600 rounded-[10px] p-3 text-[15px] text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-800"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Q2 Marketing Campaign"
            placeholderTextColor="#9ca3af"
            autoFocus
          />
        </View>

        <View className="gap-1.5">
          <Text className="text-[13px] font-semibold text-gray-700 dark:text-slate-300">Description</Text>
          <TextInput
            className="border border-gray-300 dark:border-slate-600 rounded-[10px] p-3 text-[15px] text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-800"
            style={{ height: 100 }}
            value={description}
            onChangeText={setDescription}
            placeholder="What is this project about?"
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Members */}
        <View className="gap-1.5">
          <View className="flex-row items-center justify-between">
            <Text className="text-[13px] font-semibold text-gray-700 dark:text-slate-300">Members</Text>
            {selectedProfileIds.length > 0 && (
              <Text className="text-[12px] text-blue-600 dark:text-blue-400 font-semibold">{selectedProfileIds.length} selected</Text>
            )}
          </View>
          {profilesResult.fetching && profiles.length === 0 ? (
            <ActivityIndicator size="small" color="#2563eb" style={{ marginTop: 8 }} />
          ) : (
            <View className="border border-gray-300 dark:border-slate-600 rounded-[10px] bg-white dark:bg-slate-800 overflow-hidden">
              {profiles.map((profile) => {
                const selected = selectedProfileIds.includes(profile.id);
                const isAgent = profile.agentId != null;
                const emoji = isAgent ? (profile.agent?.identityEmoji ?? DEFAULT_AGENT_EMOJI) : "👤";
                return (
                  <TouchableOpacity
                    key={profile.id}
                    className={`flex-row items-center px-3 py-2.5 gap-2.5 border-b border-gray-100 dark:border-slate-700 ${selected ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
                    onPress={() => toggleProfile(profile.id)}
                    activeOpacity={0.7}
                  >
                    <Text className="text-[18px] w-7 text-center">{emoji}</Text>
                    <View className="flex-1 gap-px">
                      <Text className="text-[14px] font-medium text-gray-900 dark:text-slate-100" numberOfLines={1}>
                        {profile.displayName}
                      </Text>
                      <Text className="text-[12px] text-gray-400 dark:text-slate-500">@{profile.username}</Text>
                    </View>
                    <View className={`w-[22px] h-[22px] rounded-full border-2 justify-center items-center ${
                      selected ? "bg-blue-600 border-blue-600" : "border-gray-300 dark:border-slate-500"
                    }`}>
                      {selected && (
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        <TouchableOpacity
          className={`bg-blue-600 rounded-[12px] p-3.5 items-center mt-2 ${saving ? "opacity-60" : ""}`}
          onPress={handleCreate}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="text-white font-bold text-base">Create Project</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
