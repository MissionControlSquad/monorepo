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
import { useMutation } from "urql";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CREATE_CHANNEL } from "@agentcenter/graphql-client";
import { useAuth } from "../../src/context/AuthContext";

type Visibility = "public" | "private" | "dm";

const VISIBILITY_OPTIONS: { key: Visibility; label: string; desc: string }[] = [
  { key: "public", label: "Public", desc: "Anyone can join" },
  { key: "private", label: "Private", desc: "Invite only" },
  { key: "dm", label: "DM", desc: "Direct message" },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
}

export default function CreateChannelScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profileId } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [saving, setSaving] = useState(false);

  const [, createChannel] = useMutation(CREATE_CHANNEL);

  async function handleCreate() {
    if (!name.trim()) {
      Alert.alert("Error", "Channel name is required");
      return;
    }
    if (!profileId) {
      Alert.alert("Error", "Not logged in");
      return;
    }
    const slug = slugify(name.trim());
    if (!slug) {
      Alert.alert("Error", "Channel name must contain valid characters (letters, numbers)");
      return;
    }

    setSaving(true);
    const res = await createChannel({
      name: name.trim(),
      slug,
      visibility,
      description: description.trim() || undefined,
      createdByProfileId: profileId,
    });
    setSaving(false);

    if (res.error) {
      Alert.alert("Error", res.error.message);
    } else if (res.data?.createChannel?.id) {
      router.replace(`/channels/${res.data.createChannel.id}`);
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
        {/* Name */}
        <View className="gap-1.5">
          <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Channel Name *</Text>
          <TextInput
            className="border border-gray-300 dark:border-slate-600 rounded-xl p-3 text-base text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-800"
            value={name}
            onChangeText={setName}
            placeholder="e.g. engineering-team"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoFocus
          />
          {name.trim().length > 0 && (
            <Text className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Slug: #{slugify(name.trim())}</Text>
          )}
        </View>

        {/* Description */}
        <View className="gap-1.5">
          <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Description</Text>
          <TextInput
            className="border border-gray-300 dark:border-slate-600 rounded-xl p-3 text-base text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-800"
            style={{ height: 80 }}
            value={description}
            onChangeText={setDescription}
            placeholder="What is this channel for?"
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Visibility */}
        <View className="gap-1.5">
          <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Visibility</Text>
          <View className="flex-row gap-2">
            {VISIBILITY_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                className={`flex-1 border rounded-xl p-3 items-center gap-0.5 ${
                  visibility === opt.key
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                    : "border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800"
                }`}
                onPress={() => setVisibility(opt.key)}
                activeOpacity={0.8}
              >
                <Text
                  className={`text-sm font-semibold ${
                    visibility === opt.key
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-700 dark:text-slate-300"
                  }`}
                >
                  {opt.label}
                </Text>
                <Text className="text-xs text-gray-400 dark:text-slate-500 text-center">{opt.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity
          className={`bg-blue-600 rounded-xl p-3.5 items-center mt-2 ${saving ? "opacity-60" : ""}`}
          onPress={handleCreate}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="text-white font-bold text-base">Create Channel</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
