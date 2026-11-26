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
import { FormField } from "../src/components/FormField";
import { ActionButton } from "../src/components/ActionButton";
import { useEffect, useState } from "react";
import { useNavigation } from "expo-router";
import { useQuery, useMutation } from "urql";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CHANGE_PASSWORD, SET_SYSTEM_SHUTDOWN, SYSTEM_SETTINGS_QUERY } from "@agentcenter/graphql-client";
import { useAuth } from "../src/context/AuthContext";

// ── Main screen ───────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { onLogout } = useAuth();

  useEffect(() => {
    navigation.setOptions({ title: "Settings" });
  }, [navigation]);

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
        <ChangePasswordSection onPasswordChanged={onLogout} />
        <SystemShutdownSection />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Change Password ───────────────────────────────────────────────────────────

function ChangePasswordSection({ onPasswordChanged }: { onPasswordChanged: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [{ fetching }, changePassword] = useMutation(CHANGE_PASSWORD);

  const handleSubmit = async () => {
    if (!current) { Alert.alert("Validation", "Current password is required"); return; }
    if (next.length < 8) { Alert.alert("Validation", "New password must be at least 8 characters"); return; }
    if (next !== confirm) { Alert.alert("Validation", "Passwords do not match"); return; }

    const res = await changePassword({ currentPassword: current, newPassword: next });
    if (res.error) {
      const msg = res.error.graphQLErrors[0]?.message ?? res.error.message ?? "Failed to change password";
      Alert.alert("Error", msg);
      return;
    }

    Alert.alert(
      "Password Changed",
      "Your password has been changed. All existing sessions will be revoked. You will be signed out.",
      [{ text: "OK", onPress: onPasswordChanged }],
    );
    setCurrent(""); setNext(""); setConfirm("");
  };

  return (
    <View className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700 gap-3.5">
      <View className="flex-row items-start gap-3">
        <View className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-slate-700 justify-center items-center shrink-0">
          <Ionicons name="lock-closed-outline" size={20} color="#6b7280" />
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold text-gray-900 dark:text-slate-100">Change Password</Text>
          <Text className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">All existing sessions will be revoked.</Text>
        </View>
      </View>

      <FormField label="Current Password">
        <View className="flex-row items-center bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5">
          <TextInput
            className="flex-1 text-base text-gray-900 dark:text-slate-100 py-3"
            value={current}
            onChangeText={setCurrent}
            secureTextEntry={!showCurrent}
            placeholder="Current password"
            placeholderTextColor="#9ca3af"
            autoCorrect={false}
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={() => setShowCurrent(!showCurrent)} className="p-1">
            <Ionicons name={showCurrent ? "eye-off-outline" : "eye-outline"} size={18} color="#9ca3af" />
          </TouchableOpacity>
        </View>
      </FormField>

      <FormField label="New Password">
        <View className="flex-row items-center bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5">
          <TextInput
            className="flex-1 text-base text-gray-900 dark:text-slate-100 py-3"
            value={next}
            onChangeText={setNext}
            secureTextEntry={!showNext}
            placeholder="Min. 8 characters"
            placeholderTextColor="#9ca3af"
            autoCorrect={false}
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={() => setShowNext(!showNext)} className="p-1">
            <Ionicons name={showNext ? "eye-off-outline" : "eye-outline"} size={18} color="#9ca3af" />
          </TouchableOpacity>
        </View>
      </FormField>

      <FormField label="Confirm New Password">
        <View className="flex-row items-center bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5">
          <TextInput
            className="flex-1 text-base text-gray-900 dark:text-slate-100 py-3"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry={!showConfirm}
            placeholder="Repeat new password"
            placeholderTextColor="#9ca3af"
            autoCorrect={false}
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} className="p-1">
            <Ionicons name={showConfirm ? "eye-off-outline" : "eye-outline"} size={18} color="#9ca3af" />
          </TouchableOpacity>
        </View>
      </FormField>

      <ActionButton label="Change Password" onPress={handleSubmit} loading={fetching} disabled={false} />
    </View>
  );
}

// ── System Shutdown ───────────────────────────────────────────────────────────

function SystemShutdownSection() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [result, reexecute] = useQuery<{ systemSettings: { shutdownActive: boolean } | null }>({
    query: SYSTEM_SETTINGS_QUERY,
    requestPolicy: "cache-and-network",
    pause: !mounted,
  });

  const [{ fetching }, setShutdown] = useMutation(SET_SYSTEM_SHUTDOWN);

  const active = result.data?.systemSettings?.shutdownActive ?? false;

  const handleToggle = () => {
    const nextActive = !active;
    const action = nextActive ? "Activate" : "Deactivate";
    const message = nextActive
      ? "This will block all new task creation and prevent agents from picking up new work."
      : "This will re-enable task creation and agent work.";

    Alert.alert(`${action} Shutdown`, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: action,
        style: nextActive ? "destructive" : "default",
        onPress: async () => {
          const res = await setShutdown({ active: nextActive });
          if (res.error) {
            Alert.alert("Error", "Failed to update system shutdown");
          } else {
            reexecute({ requestPolicy: "network-only" });
          }
        },
      },
    ]);
  };

  return (
    <View className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700 gap-3.5">
      <View className="flex-row items-start gap-3">
        <View className={`w-9 h-9 rounded-lg justify-center items-center shrink-0 ${active ? "bg-red-100 dark:bg-red-950/30" : "bg-gray-100 dark:bg-slate-700"}`}>
          <Ionicons
            name="power-outline"
            size={20}
            color={active ? "#dc2626" : "#6b7280"}
          />
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold text-gray-900 dark:text-slate-100">System Shutdown</Text>
          {active && (
            <View className="bg-red-100 dark:bg-red-950/30 rounded-md px-2 py-1 self-start mt-1">
              <Text className="text-xs font-bold text-red-600 dark:text-red-400">Active</Text>
            </View>
          )}
        </View>
      </View>

      <View className="gap-1.5">
        {[
          "Blocks all new task creation (dashboard & API)",
          "Prevents agents from picking up new work",
          "Stops recurring tasks from generating",
          "Does not affect tasks already in progress",
        ].map((line) => (
          <View key={line} className="flex-row gap-2 items-start">
            <Text className="text-sm text-gray-500 dark:text-slate-400 leading-5">•</Text>
            <Text className="text-sm text-gray-500 dark:text-slate-400 flex-1 leading-5">{line}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        className={`rounded-xl py-3.5 items-center ${active ? "bg-green-600" : "bg-red-600"} ${fetching ? "opacity-50" : ""}`}
        onPress={handleToggle}
        disabled={fetching || result.fetching}
        activeOpacity={0.8}
      >
        {fetching ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text className="text-white text-base font-semibold">
            {active ? "Deactivate Shutdown" : "Activate Shutdown"}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
