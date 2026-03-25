import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useState, useEffect } from "react";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useQuery, useMutation } from "urql";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AGENT_EDIT_QUERY, UPDATE_AGENT_PROFILE } from "@agentcenter/graphql-client";
import { AGENT_EMOJI_PRESETS, DEFAULT_AGENT_EMOJI } from "@agentcenter/utils";

export default function EditAgentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [emoji, setEmoji] = useState(DEFAULT_AGENT_EMOJI);
  const [personality, setPersonality] = useState("");
  const [dirty, setDirty] = useState(false);

  const [result] = useQuery({
    query: AGENT_EDIT_QUERY,
    variables: { id },
    requestPolicy: "network-only",
  });

  const [{ fetching: saving }, updateProfile] = useMutation(UPDATE_AGENT_PROFILE);

  const agent = result.data?.agent;

  useEffect(() => {
    if (agent) {
      navigation.setOptions({ title: `Edit ${agent.name}` });
      setName(agent.name ?? "");
      setRole(agent.role ?? "");
      setEmoji(agent.identityEmoji ?? DEFAULT_AGENT_EMOJI);
      setPersonality(agent.personality ?? "");
    }
  }, [agent, navigation]);

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert("Required", "Name is required"); return; }
    if (!role.trim()) { Alert.alert("Required", "Role is required"); return; }

    const res = await updateProfile({
      id,
      name: name.trim(),
      role: role.trim(),
      identityEmoji: emoji,
      personality: personality.trim() || null,
    });

    if (res.error) {
      Alert.alert("Error", res.error.message || "Failed to save");
    } else {
      setDirty(false);
      router.back();
    }
  };

  const track = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setDirty(true);
  };

  if (result.fetching && !agent) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50 dark:bg-slate-900">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50 dark:bg-slate-900"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <View className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700 gap-3">
          <Text className="text-base font-bold text-gray-900 dark:text-slate-100">Identity</Text>

          <View className="gap-1.5">
            <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">
              Name <Text className="text-red-600 dark:text-red-400">*</Text>
            </Text>
            <TextInput
              className="bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5 py-3 text-base text-gray-900 dark:text-slate-100"
              value={name}
              onChangeText={track(setName)}
              placeholder="Agent name"
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View className="gap-1.5">
            <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">
              Role <Text className="text-red-600 dark:text-red-400">*</Text>
            </Text>
            <TextInput
              className="bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5 py-3 text-base text-gray-900 dark:text-slate-100"
              value={role}
              onChangeText={track(setRole)}
              placeholder="e.g. Backend Engineer"
              placeholderTextColor="#9ca3af"
            />
          </View>

          {agent?.username ? (
            <View className="gap-1.5">
              <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Username</Text>
              <View className="bg-gray-100 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5 py-3 justify-center">
                <Text className="text-sm text-gray-400 dark:text-slate-500">@{agent.username}</Text>
              </View>
              <Text className="text-xs text-gray-400 dark:text-slate-500">Username cannot be changed after creation</Text>
            </View>
          ) : null}

          <View className="gap-1.5">
            <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Emoji</Text>
            <View className="flex-row flex-wrap gap-2">
              {AGENT_EMOJI_PRESETS.map((e) => (
                <TouchableOpacity
                  key={e}
                  className={`w-11 h-11 rounded-xl border-[1.5px] justify-center items-center ${
                    emoji === e
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                      : "border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700"
                  }`}
                  onPress={() => { setEmoji(e); setDirty(true); }}
                  activeOpacity={0.7}
                >
                  <Text className="text-xl">{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        <View className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700 gap-3">
          <Text className="text-base font-bold text-gray-900 dark:text-slate-100">Personality & Instructions</Text>
          <Text className="text-xs text-gray-400 dark:text-slate-500">
            Define the agent's working style, expertise, and behaviour guidelines.
          </Text>
          <TextInput
            className="bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5 py-3 text-base text-gray-900 dark:text-slate-100"
            style={{ minHeight: 140 }}
            value={personality}
            onChangeText={track(setPersonality)}
            placeholder="Describe how this agent should behave…"
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={8}
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity
          className={`bg-blue-600 rounded-xl py-3.5 items-center ${(!dirty || saving) ? "opacity-45" : ""}`}
          onPress={handleSave}
          disabled={!dirty || saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text className="text-white text-base font-semibold">Save Changes</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity className="items-center py-2.5" onPress={() => router.back()} activeOpacity={0.7}>
          <Text className="text-base text-gray-500 dark:text-slate-400">Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
