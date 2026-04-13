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
import { DEFAULT_COLOR, formatDate, LicenseStatusCode } from "@agentcenter/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LicenseData {
  status: string;
  plan: string | null;
  org: string | null;
  expiresAt: string | null;
  features: string[];
  maxAgents: number;
  maxProjects: number;
  maxSeats: number;
}

function limitLabel(n: number): string {
  return n === -1 ? "Unlimited" : String(n);
}


// ── Main screen ───────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { serverUrl, onLogout } = useAuth();

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
        <LicenseSection serverUrl={serverUrl} />
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

// ── License ───────────────────────────────────────────────────────────────────

function LicenseSection({ serverUrl }: { serverUrl: string | null }) {
  const [license, setLicense] = useState<LicenseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [licenseKey, setLicenseKey] = useState("");
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  const fetchLicense = () => {
    if (!serverUrl) return;
    setLoading(true);
    fetch(`${serverUrl}/api/license`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setLicense(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchLicense(); }, [serverUrl]);

  const handleActivate = async () => {
    if (!licenseKey.trim() || !serverUrl) return;
    setActivating(true);
    setActivateError(null);
    try {
      const res = await fetch(`${serverUrl}/api/license`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: licenseKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setActivateError(data.message ?? "Activation failed");
        return;
      }
      setLicenseKey("");
      Alert.alert("Success", "License activated successfully");
      fetchLicense();
    } catch (err) {
      setActivateError((err as Error).message ?? "Something went wrong");
    } finally {
      setActivating(false);
    }
  };

  const statusColor: Record<string, string> = {
    active: "#16a34a",
    grace: "#d97706",
    expired: "#dc2626",
    none: DEFAULT_COLOR,
  };

  const status = license?.status ?? LicenseStatusCode.NONE;
  const color = statusColor[status] ?? DEFAULT_COLOR;

  return (
    <View className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700 gap-3.5">
      <View className="flex-row items-start gap-3">
        <View className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-slate-700 justify-center items-center shrink-0">
          <Ionicons name="key-outline" size={20} color="#6b7280" />
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold text-gray-900 dark:text-slate-100">License</Text>
          <Text className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Your current license details</Text>
        </View>
        {!loading && license && (
          <View className="rounded-md px-2 py-1 self-center" style={{ backgroundColor: color + "22" }}>
            <Text className="text-xs font-bold lowercase" style={{ color }}>{status}</Text>
          </View>
        )}
      </View>

      {loading && (
        <View className="flex-row items-center gap-2">
          <ActivityIndicator size="small" color="#2563eb" />
          <Text className="text-sm text-gray-500 dark:text-slate-400">Loading license…</Text>
        </View>
      )}

      {error && !loading && (
        <Text className="text-sm text-red-600 dark:text-red-400">Failed to load license: {error}</Text>
      )}

      {license && !loading && (
        <>
          <View className="gap-3">
            <LicenseGridItem label="Organization" value={license.org ?? "—"} />
            <LicenseGridItem label="Plan" value={license.plan ?? "—"} />
            <LicenseGridItem label="Expires" value={formatDate(license.expiresAt)} />
            <LicenseGridItem
              label="Limits"
              value={`${limitLabel(license.maxAgents)} agents / ${limitLabel(license.maxProjects)} projects / ${limitLabel(license.maxSeats)} seats`}
            />
          </View>

          {license.features.length > 0 && (
            <View className="gap-2">
              <Text className="text-xs font-bold text-gray-400 dark:text-slate-500 lowercase tracking-[0.3px]">Licensed features</Text>
              <View className="flex-row flex-wrap gap-1.5">
                {license.features.map((f) => (
                  <View key={f} className="bg-gray-100 dark:bg-slate-700 rounded-md px-2 py-1">
                    <Text className="text-xs text-gray-700 dark:text-slate-300">{f}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </>
      )}

      {/* Activate / update license */}
      <View className="h-px bg-gray-100 dark:bg-slate-700" />
      <View className="gap-1.5">
        <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">{license?.status === LicenseStatusCode.ACTIVE ? "Update License Key" : "Activate License"}</Text>
        <View className="flex-row items-center bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5">
          <TextInput
            className="flex-1 text-base text-gray-900 dark:text-slate-100 py-3"
            value={licenseKey}
            onChangeText={setLicenseKey}
            placeholder="Paste your license key…"
            placeholderTextColor="#9ca3af"
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
        {activateError ? <Text className="text-sm text-red-600 dark:text-red-400">{activateError}</Text> : null}
      </View>
      <TouchableOpacity
        className={`bg-blue-600 rounded-xl py-3.5 items-center ${(!licenseKey.trim() || activating) ? "opacity-50" : ""}`}
        onPress={handleActivate}
        disabled={!licenseKey.trim() || activating}
        activeOpacity={0.8}
      >
        {activating ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text className="text-white text-base font-semibold">
            {license?.status === LicenseStatusCode.ACTIVE ? "Update License" : "Activate License"}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function LicenseGridItem({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row gap-3">
      <Text className="text-sm text-gray-500 dark:text-slate-400 w-24 shrink-0">{label}</Text>
      <Text className="text-sm font-semibold text-gray-900 dark:text-slate-100 flex-1">{value}</Text>
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
